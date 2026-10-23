// Satu-satunya sumber kebenaran daftar spesialis.
// Sebelumnya daftar ini hidup di tiga tempat (array `agents` di index.ts, `ALLOWED_SLUGS`,
// dan konstanta AGENTS di web/src/App.tsx) dan sudah menyimpang: UI punya 7 agen,
// server 5, sehingga `demo-run` untuk copywriter/seo selalu 400.
export type Agent = {
  id: string;
  name: string;
  shortName: string;
  role: string;
  slug: string;
  personality: string;
  catchphrase: string;
  specialty: string;
  color: string;
};

// Character layer: nama panjang untuk narasi, shortName untuk label 3D dan panel.
export const AGENTS: Agent[] = [
  { id: "manager", slug: "senior-project-manager", name: "Mara Sol", shortName: "Manajer", role: "project manager", personality: "tenang, tegas, menjaga pekerjaan tetap bergerak", catchphrase: "Satu langkah berikutnya yang jelas.", specialty: "mengubah tujuan yang kacau menjadi antrean kerja", color: "#f59e0b" },
  { id: "backend", slug: "backend-architect", name: "Bram Forge", shortName: "Backend", role: "backend architect", personality: "metodis, defensif, terobsesi pada batas sistem", catchphrase: "Buat kegagalan jadi biasa.", specialty: "API, kontrak data, dan layanan andal", color: "#10b981" },
  { id: "frontend", slug: "frontend-developer", name: "Nia Pixel", shortName: "Frontend", role: "frontend developer", personality: "presisi, cepat, mengutamakan pengguna", catchphrase: "Kalau terasa lambat, berarti lambat.", specialty: "antarmuka React responsif dan alur aksesibel", color: "#3b82f6" },
  { id: "designer", slug: "ui-designer", name: "Luma Vale", shortName: "Designer", role: "UI/UX designer", personality: "ingin tahu, hangat, tegas soal kejelasan", catchphrase: "Hapus satu hal lagi.", specialty: "sistem visual, interaksi, dan kejelasan produk", color: "#a855f7" },
  { id: "reviewer", slug: "code-reviewer", name: "Vera Check", shortName: "Reviewer", role: "code reviewer", personality: "baik, skeptis, berbasis bukti", catchphrase: "Tunjukkan kasus tepinya.", specialty: "menemukan risiko, menjaga kualitas, dan keyakinan rilis", color: "#ef4444" },
  { id: "copywriter", slug: "copywriter", name: "Kara Quill", shortName: "Copywriter", role: "copywriter", personality: "kreatif, ringkas, alergi klise", catchphrase: "Satu kalimat, satu maksud.", specialty: "tulisan produk, narasi, dan pesan yang menjual", color: "#ec4899" },
  { id: "seo", slug: "seo-specialist", name: "Rangga Index", shortName: "SEO", role: "SEO specialist", personality: "sabar, analitis, berbasis data", catchphrase: "Kalau tidak terukur, itu cuma tebakan.", specialty: "riset kata kunci, struktur, dan keterbacaan mesin pencari", color: "#14b8a6" },
];

export const ALLOWED_SLUGS: string[] = AGENTS.map(agent => agent.slug);

export function findAgent(slug: string): Agent | undefined {
  return AGENTS.find(agent => agent.slug === slug);
}
