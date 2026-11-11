import React from 'react';
import { PageHeader, UnavailableState } from '../../components/ui';

/*
 * Destinations from the product expansion (docs/design.md §17–29) that have NO working service
 * behind them yet. Each page says so plainly and lists what the server must provide first. None of
 * them renders sample posts, messages, notifications or AI output.
 */

export function CommunityView() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <PageHeader
        eyebrow="Komunitas"
        title="Komunitas"
        description="Ruang untuk bertanya, berbagi catatan, dan belajar bersama. Dirancang belajar-dulu, bukan mengejar interaksi."
      />
      <UnavailableState
        icon="users"
        title="Komunitas belum dibuka"
        description="Komunitas melibatkan pengguna lain, jadi baru boleh dibuka setelah keamanan dan moderasinya benar-benar berjalan di server. Tidak ada kiriman contoh yang ditampilkan di sini."
        requirements={[
          'Layanan postingan, komentar, reaksi, ikuti, dan feed dengan paginasi (kursor)',
          'Otorisasi sisi server untuk profil, postingan, grup, dan berkas: aturan visibilitas ditegakkan server',
          'Pelaporan, pemblokiran, antrean moderasi, eskalasi, dan banding yang dijalankan secara operasional',
          'Batas laju, pencegahan spam, dan idempotensi untuk aksi sosial',
          'Perlindungan khusus akun anak dan remaja: batasan pesan, konten, dan persetujuan wali sesuai hukum wilayah peluncuran',
          'Unggah media tervalidasi (tipe, tanda tangan berkas, ukuran, durasi) dengan akses berizin',
        ]}
        action={{ to: '/bantuan', label: 'Baca pusat bantuan & keamanan' }}
      />
    </div>
  );
}

export function MessagesView() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <PageHeader eyebrow="Komunitas" title="Pesan" description="Percakapan pribadi dan grup belajar." />
      <UnavailableState
        icon="message"
        title="Pesan belum tersedia"
        description="Pesan langsung membutuhkan layanan percakapan, aturan permintaan pesan, dan perlindungan bagi pengguna di bawah umur. Belum ada yang berjalan, jadi tidak ada kotak masuk tiruan."
        requirements={[
          'Layanan percakapan satu-satu dan grup dengan status kirim yang bisa dipercaya',
          'Permintaan pesan dari orang yang belum dikenal, serta blokir, bisukan, dan laporkan',
          'Pencegahan pengiriman ganda saat coba ulang atau sambung ulang',
          'Aturan komunikasi yang ditinjau untuk akun anak dan remaja sebelum pesan diaktifkan',
          'Transport waktu nyata atau polling cadangan, dengan kebijakan retensi dan penghapusan',
        ]}
        action={{ to: '/', label: 'Kembali ke beranda' }}
      />
    </div>
  );
}

export function NotificationsView() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <PageHeader eyebrow="Pemberitahuan" title="Notifikasi" description="Pengingat belajar, tenggat peluang, dan aktivitas." />
      <UnavailableState
        icon="bell"
        title="Notifikasi belum tersedia"
        description="Belum ada layanan notifikasi, dan aplikasi ini belum meminta izin notifikasi perangkat. Pengingat tenggat peluang yang kamu simpan bisa dilihat langsung di Beranda dan di halaman Beasiswa & Peluang."
        requirements={[
          'Layanan notifikasi dengan preferensi per kategori, jam tenang, dan ringkasan',
          'Pengiriman push/email hanya setelah izin pengguna dan infrastruktur siap',
          'Isi pesan sensitif tidak tampil di layar kunci secara bawaan',
          'Setiap notifikasi mengarah ke tujuan yang tepat (deep link)',
        ]}
        action={{ to: '/peluang', label: 'Lihat tenggat peluang' }}
      />
    </div>
  );
}

export function AssistantView() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <PageHeader eyebrow="Belajar" title="Asisten AI" description="Pendamping belajar lintas materi, dengan konteks dan sumber yang terlihat." />
      <UnavailableState
        icon="sparkles"
        title="Asisten lintas aplikasi belum tersedia"
        description="Saat ini AI hanya bisa dipakai per materi (tab Tanya AI di ruang kerja materi), dan itu pun bergantung pada layanan AI di server. Asisten umum belum ada, jadi tidak ada jawaban tiruan di sini."
        requirements={[
          'Sesi asisten di server dengan pilihan konteks (materi, mata pelajaran, umum) yang terlihat oleh pengguna',
          'Pengambilan sumber (retrieval) dengan tautan ke dokumen asal untuk klaim faktual',
          'Aksi simpan atau terbitkan hanya setelah konfirmasi eksplisit, dan hasil AI tidak pernah dianggap karya pengguna secara diam-diam',
          'Kebijakan keamanan sesuai jenjang, tanpa pengumpulan data pribadi yang sensitif',
          'Kebijakan jelas soal pemakaian pesan, catatan, atau profil sebagai konteks',
        ]}
        action={{ to: '/materi', label: 'Buka materi untuk Tanya AI' }}
      />
    </div>
  );
}
