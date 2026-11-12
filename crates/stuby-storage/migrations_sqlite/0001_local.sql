-- Stuby on-device database (SQLite). Used by the offline desktop and Android builds.
-- Same tables and column shapes as the Postgres baseline (0001 + 0002), single owner, no row-level
-- security: the whole file belongs to one person. JSON columns are plain text (the storage layer
-- parses them on read). Community tables (opportunities, tracking, peer profiles) are not created:
-- those features need a shared Stuby server.

CREATE TABLE app_users (
  id         text PRIMARY KEY,
  label      text NOT NULL DEFAULT 'owner',
  created_at real NOT NULL DEFAULT (CAST(strftime('%s','now') AS REAL))
);

-- Server-side login sessions (token stored hashed). Not row-secured: looked up before the owner is
-- known. The cookie value never equals the stored hash.
CREATE TABLE sessions (
  id         integer PRIMARY KEY AUTOINCREMENT,
  user_id    text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at real NOT NULL,
  expires_at real NOT NULL,
  user_agent text
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ---------------------------------------------------------------- core learning data
CREATE TABLE subjects (
  id         integer PRIMARY KEY AUTOINCREMENT,
  user_id    text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name       text NOT NULL,
  color      text DEFAULT '#4f7cac',
  created_at real NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE documents (
  id           integer PRIMARY KEY AUTOINCREMENT,
  user_id      text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  subject_id   integer REFERENCES subjects(id) ON DELETE SET NULL,
  title        text NOT NULL,
  title_locked integer NOT NULL DEFAULT 0,
  filename     text NOT NULL,
  mime         text,
  size         integer DEFAULT 0,
  file_path    text,            -- storage key relative to the files root (never an absolute path)
  status       text NOT NULL DEFAULT 'queued',
  error        text,
  warning      text,
  page_count   integer DEFAULT 0,
  summary      text,
  key_concepts text,
  topics       text,
  style        text,
  created_at   real NOT NULL,
  updated_at   real NOT NULL
);
CREATE INDEX idx_documents_subject ON documents(subject_id);

CREATE TABLE chunks (
  id          integer PRIMARY KEY AUTOINCREMENT,
  user_id     text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  document_id integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idx         integer NOT NULL,
  label       text,
  text        text NOT NULL,
  note_md     text
);
CREATE INDEX idx_chunks_doc ON chunks(document_id, idx);

CREATE TABLE notes (
  document_id integer PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  user_id     text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  content_md  text NOT NULL,
  edited      integer NOT NULL DEFAULT 0,
  version     integer NOT NULL DEFAULT 1,
  updated_at  real NOT NULL
);

CREATE TABLE quizzes (
  id          integer PRIMARY KEY AUTOINCREMENT,
  user_id     text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  document_id integer REFERENCES documents(id) ON DELETE CASCADE,
  subject_id  integer REFERENCES subjects(id) ON DELETE SET NULL,
  title       text NOT NULL,
  difficulty  text,
  created_at  real NOT NULL
);

CREATE TABLE questions (
  id               integer PRIMARY KEY AUTOINCREMENT,
  user_id          text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  quiz_id          integer NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position         integer NOT NULL DEFAULT 0,
  qtype            text NOT NULL,
  question         text NOT NULL,
  options          text,
  answer           text NOT NULL,
  keywords         text,
  explanation      text,
  topic            text,
  source           text,
  deep_explanation text
);
CREATE INDEX idx_questions_quiz ON questions(quiz_id, position);

CREATE TABLE attempts (
  id            integer PRIMARY KEY AUTOINCREMENT,
  user_id       text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  quiz_id       integer REFERENCES quizzes(id) ON DELETE CASCADE,
  mode          text NOT NULL DEFAULT 'practice',
  question_ids  text NOT NULL,
  time_limit    integer,
  started_at    real NOT NULL,
  finished_at   real,
  score         integer,
  total         integer,
  duration      integer,
  grading       text NOT NULL DEFAULT 'done',
  grading_job   integer
);

CREATE TABLE answers (
  id          integer PRIMARY KEY AUTOINCREMENT,
  user_id     text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  attempt_id  integer NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id integer NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  given       text,
  correct     integer,
  feedback    text,
  graded_by   text,
  ts          real NOT NULL,
  UNIQUE (attempt_id, question_id)
);
CREATE INDEX idx_answers_q ON answers(question_id);

CREATE TABLE study_events (
  id          integer PRIMARY KEY AUTOINCREMENT,
  user_id     text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  ts          real NOT NULL,
  day         text NOT NULL,
  kind        text NOT NULL,
  document_id integer REFERENCES documents(id) ON DELETE SET NULL,
  seconds     integer NOT NULL DEFAULT 0,
  quizzes     integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_events_day ON study_events(day);

CREATE TABLE jobs (
  id         integer PRIMARY KEY AUTOINCREMENT,
  user_id    text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  kind       text NOT NULL,
  status     text NOT NULL DEFAULT 'queued',
  progress   real NOT NULL DEFAULT 0,
  message    text,
  result     text,
  error      text,
  ref_id     integer,
  created_at real NOT NULL,
  updated_at real NOT NULL
);
CREATE INDEX idx_jobs_ref ON jobs(kind, ref_id);

CREATE TABLE settings (
  user_id text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  key     text NOT NULL,
  value   text,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE chat_sessions (
  id                 integer PRIMARY KEY AUTOINCREMENT,
  user_id            text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  document_id        integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'preparing',
  gateway_session_id text,
  context_md         text,
  created_at         real NOT NULL,
  updated_at         real NOT NULL
);
CREATE INDEX idx_chat_sessions_doc ON chat_sessions(document_id);

CREATE TABLE chat_messages (
  id         integer PRIMARY KEY AUTOINCREMENT,
  user_id    text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  session_id integer NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role       text NOT NULL,
  content    text NOT NULL,
  ts         real NOT NULL
);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);

CREATE TABLE ask_sessions (
  id                 integer PRIMARY KEY AUTOINCREMENT,
  user_id            text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  document_id        integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  gateway_session_id text,
  created_at         real NOT NULL,
  updated_at         real NOT NULL
);
CREATE INDEX idx_ask_sessions_doc ON ask_sessions(document_id);

-- ---------------------------------------------------------------- profile, concepts, cards
-- Legacy columns `coins` and `city_collected_at` died with the v2 game rewrite and are not carried over.
CREATE TABLE player (
  user_id text PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  xp      integer NOT NULL DEFAULT 0
);

CREATE TABLE achievements (
  user_id     text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  key         text NOT NULL,
  unlocked_at real NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE concepts (
  id          integer PRIMARY KEY AUTOINCREMENT,
  user_id     text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  document_id integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  term        text NOT NULL,
  definition  text NOT NULL,
  topic       text,
  seen        integer NOT NULL DEFAULT 0,
  hits        integer NOT NULL DEFAULT 0,
  UNIQUE (document_id, term)
);
CREATE INDEX idx_concepts_doc ON concepts(document_id);

CREATE TABLE cards (
  id          integer PRIMARY KEY AUTOINCREMENT,
  user_id     text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  document_id integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  front       text NOT NULL,
  back        text NOT NULL,
  ease        real NOT NULL DEFAULT 2.5,
  interval    integer NOT NULL DEFAULT 0,
  reps        integer NOT NULL DEFAULT 0,
  lapses      integer NOT NULL DEFAULT 0,
  due_day     text NOT NULL,
  last_review real,
  created_at  real NOT NULL,
  UNIQUE (document_id, front)
);
CREATE INDEX idx_cards_due ON cards(due_day);

-- ---------------------------------------------------------------- games (v2)
CREATE TABLE game_runs (
  id                 integer PRIMARY KEY AUTOINCREMENT,
  user_id            text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  game               text NOT NULL,
  scope_kind         text NOT NULL,
  scope_id           integer NOT NULL,
  options            text,
  status             text NOT NULL DEFAULT 'active',
  gateway_session_id text,
  state              text,
  turn_count         integer NOT NULL DEFAULT 0,
  max_turns          integer NOT NULL DEFAULT 8,
  resumes            integer NOT NULL DEFAULT 0,
  correct            integer NOT NULL DEFAULT 0,
  total              integer NOT NULL DEFAULT 0,
  xp                 integer NOT NULL DEFAULT 0,
  summary            text,
  started_at         real NOT NULL,
  updated_at         real NOT NULL,
  finished_at        real
);
CREATE INDEX idx_game_runs_status ON game_runs(status, updated_at);

CREATE TABLE game_turns (
  id          integer PRIMARY KEY AUTOINCREMENT,
  user_id     text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  run_id      integer NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
  idx         integer NOT NULL,
  client_key  text,
  status      text NOT NULL,
  concept_ids text,
  kind        text,
  directive   text,
  narration   text,
  partial     text,
  public      text,
  secret      text,               -- answer keys / rubrics: never serialised to a client before judging
  answer      text,
  judgement   text,
  hint_level  integer NOT NULL DEFAULT 0,
  flagged     integer NOT NULL DEFAULT 0,
  retries     integer NOT NULL DEFAULT 0,
  error       text,
  created_at  real NOT NULL,
  updated_at  real NOT NULL,
  UNIQUE (user_id, client_key)
);
CREATE INDEX idx_turns_run ON game_turns(run_id, idx);

CREATE TABLE mastery (
  concept_id integer PRIMARY KEY REFERENCES concepts(id) ON DELETE CASCADE,
  user_id    text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  score      real NOT NULL DEFAULT 0,
  evidence_n integer NOT NULL DEFAULT 0,
  kinds      text,
  last_at    real
);

CREATE TABLE evidence (
  id         integer PRIMARY KEY AUTOINCREMENT,
  user_id    text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  concept_id integer NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  run_id     integer,
  turn_id    integer,
  kind       text NOT NULL,
  obs        real NOT NULL,
  hint_level integer NOT NULL DEFAULT 0,
  ts         real NOT NULL
);
CREATE INDEX idx_evidence_concept ON evidence(concept_id, id);
CREATE INDEX idx_evidence_turn ON evidence(turn_id);

CREATE TABLE quests (
  user_id text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  day     text NOT NULL,
  key     text NOT NULL,
  done_at real,
  PRIMARY KEY (user_id, day, key)
);

CREATE TABLE mindmaps (
  document_id integer PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  user_id     text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  tree        text NOT NULL,
  node_count  integer NOT NULL DEFAULT 0,
  source_ts   real,
  created_at  real NOT NULL,
  updated_at  real NOT NULL
);

ALTER TABLE app_users ADD COLUMN role text NOT NULL DEFAULT 'student';
ALTER TABLE app_users ADD COLUMN is_admin integer NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN opportunity_id integer;
CREATE INDEX idx_documents_opportunity ON documents(opportunity_id);
