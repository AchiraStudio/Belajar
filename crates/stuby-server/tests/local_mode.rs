//! The offline app end to end: a real server on a loopback port, a real SQLite file, no settings.

use std::path::PathBuf;

use serde_json::{Value, json};
use stuby_server::{Config, Server};

struct Running {
    base: String,
    http: reqwest::Client,
    dir: PathBuf,
    _stop: tokio::sync::oneshot::Sender<()>,
}

async fn start(token: &str) -> Running {
    stuby_server::init_tracing();
    let dir = std::env::temp_dir().join(format!("stuby-local-{}", uuid::Uuid::new_v4()));
    let config = Config::local(&dir, PathBuf::from("../../app/dist"), 0, token.to_owned());
    let server = Server::prepare(&config).await.expect("offline server starts with no settings");
    let addr = server.local_addr().expect("addr");
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    tokio::spawn(async move {
        let _ = server
            .run(async move {
                let _ = stopped.await;
            })
            .await;
    });
    Running {
        base: format!("http://{addr}"),
        http: reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("client"),
        dir,
        _stop: stop,
    }
}

async fn rpc(r: &Running, cookie: &str, action: &str, body: Value) -> (u16, Value) {
    let res = r
        .http
        .post(format!("{}/api/rpc/{action}", r.base))
        .header("cookie", cookie)
        .json(&body)
        .send()
        .await
        .expect("request");
    let status = res.status().as_u16();
    (status, res.json().await.unwrap_or(Value::Null))
}

#[tokio::test]
async fn offline_app_signs_in_once_and_serves_the_study_features() {
    let r = start("secret-token-123").await;

    // Closed to everyone but the app's own window.
    let no_cookie = r.http.post(format!("{}/api/rpc/ping", r.base)).send().await.unwrap();
    assert_eq!(no_cookie.status(), 401);
    let wrong = r.http.get(format!("{}/api/local-login?t=nope", r.base)).send().await.unwrap();
    assert_eq!(wrong.status(), 403);

    let ok = r
        .http
        .get(format!("{}/api/local-login?t=secret-token-123", r.base))
        .send()
        .await
        .unwrap();
    assert_eq!(ok.status(), 302);
    let cookie = ok
        .headers()
        .get("set-cookie")
        .expect("cookie")
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let again = r
        .http
        .get(format!("{}/api/local-login?t=secret-token-123", r.base))
        .send()
        .await
        .unwrap();
    assert_eq!(again.status(), 403, "the token is single use");

    let session: Value = r
        .http
        .get(format!("{}/api/session", r.base))
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(session["authenticated"], true);

    for action in [
        "ping", "get_settings", "list_subjects", "list_documents", "list_quizzes", "cards_stats",
        "cards_due", "cards_export", "dashboard", "progress", "play_hub", "concepts_list",
    ] {
        let (status, body) = rpc(&r, &cookie, action, json!({})).await;
        assert_eq!(status, 200, "{action}: {body}");
        assert_eq!(body["ok"], true, "{action}: {body}");
    }

    // Writes, reads back, JSON-ish settings, upsert.
    let (status, created) = rpc(&r, &cookie, "create_subject", json!({"name": "Matematika"})).await;
    assert_eq!(status, 200, "{created}");
    let (_, subjects) = rpc(&r, &cookie, "list_subjects", json!({})).await;
    assert_eq!(subjects["data"]["subjects"][0]["name"], "Matematika", "{subjects}");
    assert_eq!(subjects["data"]["subjects"][0]["doc_count"], 0);

    let (status, saved) = rpc(&r, &cookie, "save_settings", json!({"settings": {"daily_goal_min": "25"}})).await;
    assert_eq!(status, 200, "{saved}");
    let (_, settings) = rpc(&r, &cookie, "get_settings", json!({})).await;
    assert_eq!(settings["data"]["settings"]["daily_goal_min"], "25", "{settings}");

    let (status, logged) = rpc(&r, &cookie, "log_study", json!({"seconds": 90})).await;
    assert_eq!(status, 200, "{logged}");
    let (_, dash) = rpc(&r, &cookie, "dashboard", json!({})).await;
    assert_eq!(dash["ok"], true, "{dash}");

    // It really is a file on disk, so the data survives a restart.
    assert!(r.dir.join("stuby.db").is_file());
    let _ = std::fs::remove_dir_all(&r.dir);
}
