//! Pure parts of the flashcard feature (legacy `cards.py`): the Anki text export.

/// One exported card: front, back and the title of its document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportRow {
    pub front: String,
    pub back: String,
    pub title: String,
}

/// A field with tabs and carriage returns turned into spaces and newlines into `<br>`.
fn cell(text: &str) -> String {
    text.replace(['\t', '\r'], " ").replace('\n', "<br>")
}

/// Tab-separated Anki import text, one card per line, with the document title as the tag (spaces
/// become underscores). No trailing newline, exactly like the legacy `"\n".join(...)`.
#[must_use]
pub fn export_text(rows: &[ExportRow]) -> String {
    rows.iter()
        .map(|r| {
            format!(
                "{}\t{}\t{}",
                cell(&r.front),
                cell(&r.back),
                cell(&r.title).replace(' ', "_")
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_cards_gives_empty_text() {
        assert_eq!(export_text(&[]), "");
    }
}
