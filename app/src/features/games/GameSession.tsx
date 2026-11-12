import React from 'react';
import { UnavailableState } from '../../components/ui';
import { tr } from '../../services/i18n';

/**
 * The turn-by-turn game engine (streamed narration, hint levels, idempotent turns, session recovery)
 * is served by `play_turn` / `play_turn_get` / `play_get`. The current server answers those actions
 * with "AI not configured", so the session screen is intentionally not simulated here.
 */
export function GameSession() {
  return (
    <UnavailableState
      icon="game"
      title={tr('Sesi game belum bisa dimainkan')}
      description={tr('Mesin giliran game (narasi AI yang di-stream, petunjuk bertingkat, penilaian oleh server, dan pemulihan sesi) belum tersedia di server yang terhubung. Kami tidak menampilkan simulasi supaya skor dan XP-mu tetap jujur.')}
      requirements={[
        tr('Layanan AI dikonfigurasi di server (aksi play_turn, play_turn_get, play_get)'),
        tr('Aksi play_finish dan play_abandon untuk menutup sesi dan memberi hadiah'),
        tr('Aliran (stream) giliran dengan client_key agar kirim ulang tidak menggandakan giliran'),
      ]}
      action={{ to: '/game', label: tr('Kembali ke game') }}
    />
  );
}
