import materiDark from '../../../assets/shots/materi-dark.webp';
import materiLight from '../../../assets/shots/materi-light.webp';
import { Caption, ThemedImage, Win } from '../../ui/Frames';
import styles from './Panel.module.css';
import local from './LibraryPanel.module.css';

export function LibraryPanel() {
  return (
    <div className={styles.panel}>
      <Win className={local.crop}>
        <ThemedImage
          light={materiLight}
          dark={materiDark}
          alt="The Stuby materials library: three PDF cards grouped by subject, one still processing"
          altDark="The Stuby materials library in the dark theme"
          width={1440}
          height={900}
        />
        <Caption>Real screenshot, demo data</Caption>
      </Win>
      <div className={styles.copy}>
        <h3>Your files, grouped by subject.</h3>
        <p>Upload PDF, DOCX, PPTX, images, TXT or Markdown. A background pipeline extracts the text, reads image-only pages with a vision model and splits long documents into chunks. If one chunk fails, only that chunk is retried; the rest is not redone.</p>
        <p>While it works, the card shows <em>Processing</em> with a progress bar, as in the screenshot.</p>
      </div>
    </div>
  );
}
