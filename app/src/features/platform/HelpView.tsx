import React from 'react';
import { Link } from 'react-router';
import { Icon, PageHeader, SurfaceCard } from '../../components/ui';
import styles from './Help.module.css';

/** Plain, accurate guidance about how this app actually works. No reporting form: no service receives reports yet. */
export function HelpView() {
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Bantuan"
        title="Pusat Bantuan & Keamanan"
        description="Penjelasan singkat tentang di mana datamu berada, cara aman memakai peluang, dan apa yang belum tersedia."
      />

      <SurfaceCard className={styles.section}>
        <h2 className={styles.h}>Datamu dan di mana ia disimpan</h2>
        <ul>
          <li>
            <strong>Materi, catatan, kuis, kartu, dan progres</strong> disimpan di server Belajar yang kamu sambungkan. Aplikasi ini hanya menampilkannya.
          </li>
          <li>
            <strong>Kata sandi tidak disimpan di perangkat.</strong> Server memberi sesi berupa cookie yang tidak bisa dibaca skrip halaman. Tombol “Keluar” di Pengaturan mengakhiri sesi itu.
          </li>
          <li>
            <strong>Tema, ukuran huruf baca, dan lingkungan belajar</strong> disimpan di perangkat ini saja.
          </li>
          <li>
            <strong>Jawaban AI bisa salah.</strong> Periksa kembali hal penting terhadap sumber aslinya.
          </li>
        </ul>
      </SurfaceCard>

      <SurfaceCard className={styles.section}>
        <h2 className={styles.h}>Memakai beasiswa dan peluang dengan aman</h2>
        <div className={styles.callout}>
          <Icon name="shield" size={18} />
          <span>Beasiswa palsu dan tanggal kedaluwarsa bisa merugikan. Jangan pernah membayar untuk “mengamankan” beasiswa.</span>
        </div>
        <ul>
          <li>Buka situs resmi penyelenggara, lalu bandingkan tanggal, syarat, dan tautan pendaftaran dengan yang tampil di Belajar.</li>
          <li>Data peluang belum memiliki status verifikasi sumber, jadi anggap sebagai petunjuk awal, bukan jaminan.</li>
          <li>Belajar tidak menjamin kelayakan, pendanaan, atau penerimaan.</li>
          <li>
            Mulai dari <Link to="/peluang">Beasiswa &amp; Peluang</Link>; simpan yang menarik agar tenggatnya mudah dipantau.
          </li>
        </ul>
      </SurfaceCard>

      <SurfaceCard className={styles.section}>
        <h2 className={styles.h}>Pertanyaan umum</h2>
        <details className={styles.q}>
          <summary>Kenapa Komunitas, Pesan, dan Notifikasi belum bisa dipakai?</summary>
          <div>
            Fitur itu melibatkan pengguna lain. Ia baru boleh dibuka setelah otorisasi sisi server, pelaporan, moderasi, batas laju, dan perlindungan anak
            benar-benar berjalan. Halamannya menjelaskan apa yang dibutuhkan; tidak ada data contoh yang dipalsukan.
          </div>
        </details>
        <details className={styles.q}>
          <summary>Kenapa Mind Map, Tanya AI, atau Game menampilkan “belum tersedia”?</summary>
          <div>
            Fitur itu bergantung pada layanan AI di server. Jika server belum mengonfigurasinya, aplikasi menampilkan pesan dari server apa adanya dan tidak
            membuat jawaban tiruan. Kuis, kartu, progres, dan catatan yang sudah ada tetap berfungsi.
          </div>
        </details>
        <details className={styles.q}>
          <summary>Bagaimana cara melaporkan peluang atau konten yang mencurigakan?</summary>
          <div>
            Belum ada layanan penerima laporan di server, jadi tidak ada tombol lapor tiruan. Untuk sekarang, hubungi pemilik server Belajar yang kamu pakai.
          </div>
        </details>
        <details className={styles.q}>
          <summary>Apakah aplikasi ini mengirim notifikasi ke perangkatku?</summary>
          <div>Tidak. Aplikasi tidak meminta izin notifikasi dan tidak menjalankan layanan latar belakang.</div>
        </details>
      </SurfaceCard>
    </div>
  );
}
