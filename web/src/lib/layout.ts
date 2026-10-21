// layout.ts — sumber kebenaran seluruh koordinat ruangan.
// Meja (furniture) dan posisi berdiri karakter DIPISAH: karakter tidak lagi
// berdiri tepat di tengah meja (dulu tampak tembus meja/monitor).

export const ROOM = { width: 20, depth: 20, wallHeight: 4.2 };

// Jarak karakter berdiri dari pusat meja (bergeser ke sisi kamera / +z).
export const AGENT_OFFSET = { x: 0, z: 1 };

// Tataletak inti 7 meja pertama (baris demi baris, menghadap +z).
const DESK_LAYOUT: [number, number][] = [
  [-3, -1],
  [0, -1],
  [3, -1],
  [-3, 2],
  [3, 2],
  [-1.5, 3],
  [1.5, 3],
];

// Posisi meja ke-index. Aman untuk jumlah agen berapa pun: kelebihan agen
// otomatis mendapat baris meja baru yang mundur ke belakang (z - 3 per baris).
export function deskSpotAt(index: number): [number, number, number] {
  const [x, z] = DESK_LAYOUT[index % DESK_LAYOUT.length];
  const overflow = Math.floor(index / DESK_LAYOUT.length);
  return [x, 0, z - overflow * 3];
}

// Posisi berdiri karakter untuk meja ke-index (di depan meja, bukan di tengahnya).
export function agentSpotAt(index: number): [number, number, number] {
  const [x, , z] = deskSpotAt(index);
  return [x + AGENT_OFFSET.x, 0, z + AGENT_OFFSET.z];
}

// Array default (kapasitas 7). Komponen scene memakai fungsi per-index di atas,
// jadi bila AGENTS di App.tsx bertambah, meja & spot karakter ikut menyesuaikan.
export const DESK_SPOTS: [number, number, number][] = Array.from({ length: 7 }, (_, i) => deskSpotAt(i));
export const AGENT_SPOTS: [number, number, number][] = DESK_SPOTS.map((_, i) => agentSpotAt(i));

export const MEETING_TABLE: [number, number, number] = [0, 0, 5.75];

// Kursi rapat membentuk cincin 8 titik di sekeliling meja (tidak ada yang
// duduk di atas meja), dan menjauhi papan tulis di belakang meja.
export const MEETING_SPOTS: [number, number, number][] = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  return [MEETING_TABLE[0] + Math.sin(angle) * 1.5, 0, MEETING_TABLE[2] + Math.cos(angle) * 1.5];
});
