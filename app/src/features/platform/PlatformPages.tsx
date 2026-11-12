import React from 'react';
import { PageHeader, UnavailableState } from '../../components/ui';
import { tr } from '../../services/i18n';

/*
 * Destinations from the product expansion (docs/design.md §17–29) that have NO working service
 * behind them yet. Each page says so plainly and lists what the server must provide first. None of
 * them renders sample posts, messages, notifications or AI output.
 */

export function CommunityView() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <PageHeader
        eyebrow={tr('Komunitas')}
        title={tr('Komunitas')}
        description={tr('Ruang untuk bertanya, berbagi catatan, dan belajar bersama. Dirancang belajar-dulu, bukan mengejar interaksi.')}
      />
      <UnavailableState
        icon="users"
        title={tr('Komunitas belum dibuka')}
        description={tr('Komunitas melibatkan pengguna lain, jadi baru boleh dibuka setelah keamanan dan moderasinya benar-benar berjalan di server. Tidak ada kiriman contoh yang ditampilkan di sini.')}
        requirements={[
          tr('Layanan postingan, komentar, reaksi, ikuti, dan feed dengan paginasi (kursor)'),
          tr('Otorisasi sisi server untuk profil, postingan, grup, dan berkas: aturan visibilitas ditegakkan server'),
          tr('Pelaporan, pemblokiran, antrean moderasi, eskalasi, dan banding yang dijalankan secara operasional'),
          tr('Batas laju, pencegahan spam, dan idempotensi untuk aksi sosial'),
          tr('Perlindungan khusus akun anak dan remaja: batasan pesan, konten, dan persetujuan wali sesuai hukum wilayah peluncuran'),
          tr('Unggah media tervalidasi (tipe, tanda tangan berkas, ukuran, durasi) dengan akses berizin'),
        ]}
        action={{ to: '/bantuan', label: 'Baca pusat bantuan & keamanan' }}
      />
    </div>
  );
}

export function MessagesView() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <PageHeader eyebrow={tr('Komunitas')} title={tr('Pesan')} description={tr('Percakapan pribadi dan grup belajar.')} />
      <UnavailableState
        icon="message"
        title={tr('Pesan belum tersedia')}
        description={tr('Pesan langsung membutuhkan layanan percakapan, aturan permintaan pesan, dan perlindungan bagi pengguna di bawah umur. Belum ada yang berjalan, jadi tidak ada kotak masuk tiruan.')}
        requirements={[
          tr('Layanan percakapan satu-satu dan grup dengan status kirim yang bisa dipercaya'),
          tr('Permintaan pesan dari orang yang belum dikenal, serta blokir, bisukan, dan laporkan'),
          tr('Pencegahan pengiriman ganda saat coba ulang atau sambung ulang'),
          tr('Aturan komunikasi yang ditinjau untuk akun anak dan remaja sebelum pesan diaktifkan'),
          tr('Transport waktu nyata atau polling cadangan, dengan kebijakan retensi dan penghapusan'),
        ]}
        action={{ to: '/', label: tr('Kembali ke beranda') }}
      />
    </div>
  );
}

export function NotificationsView() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <PageHeader eyebrow={tr('Pemberitahuan')} title={tr('Notifikasi')} description={tr('Pengingat belajar, tenggat peluang, dan aktivitas.')} />
      <UnavailableState
        icon="bell"
        title={tr('Notifikasi belum tersedia')}
        description={tr('Belum ada layanan notifikasi, dan aplikasi ini belum meminta izin notifikasi perangkat. Pengingat tenggat peluang yang kamu simpan bisa dilihat langsung di Beranda dan di halaman Beasiswa & Peluang.')}
        requirements={[
          tr('Layanan notifikasi dengan preferensi per kategori, jam tenang, dan ringkasan'),
          tr('Pengiriman push/email hanya setelah izin pengguna dan infrastruktur siap'),
          tr('Isi pesan sensitif tidak tampil di layar kunci secara bawaan'),
          tr('Setiap notifikasi mengarah ke tujuan yang tepat (deep link)'),
        ]}
        action={{ to: '/peluang', label: 'Lihat tenggat peluang' }}
      />
    </div>
  );
}

export function AssistantView() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <PageHeader eyebrow={tr('Belajar')} title={tr('Asisten AI')} description={tr('Pendamping belajar lintas materi, dengan konteks dan sumber yang terlihat.')} />
      <UnavailableState
        icon="sparkles"
        title={tr('Asisten lintas aplikasi belum tersedia')}
        description={tr('Saat ini AI hanya bisa dipakai per materi (tab Tanya AI di ruang kerja materi), dan itu pun bergantung pada layanan AI di server. Asisten umum belum ada, jadi tidak ada jawaban tiruan di sini.')}
        requirements={[
          tr('Sesi asisten di server dengan pilihan konteks (materi, mata pelajaran, umum) yang terlihat oleh pengguna'),
          tr('Pengambilan sumber (retrieval) dengan tautan ke dokumen asal untuk klaim faktual'),
          tr('Aksi simpan atau terbitkan hanya setelah konfirmasi eksplisit, dan hasil AI tidak pernah dianggap karya pengguna secara diam-diam'),
          tr('Kebijakan keamanan sesuai jenjang, tanpa pengumpulan data pribadi yang sensitif'),
          tr('Kebijakan jelas soal pemakaian pesan, catatan, atau profil sebagai konteks'),
        ]}
        action={{ to: '/materi', label: tr('Buka materi untuk Tanya AI') }}
      />
    </div>
  );
}
