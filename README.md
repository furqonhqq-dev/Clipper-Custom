# OpenClipper Custom v0.1.0

Fondasi aplikasi desktop video lokal untuk **Windows 10/11 x64**, menggunakan **Tauri 2 + Rust** dan frontend **HTML, CSS, JavaScript** melalui Vite. Seluruh antarmuka berbahasa Indonesia. Repositori ini sebelumnya hanya berisi judul `Clipper-Custom` / `klipper`; tidak ada kode aplikasi lama yang dihapus.

## Fitur yang tersedia

- Dashboard tema gelap dan navigasi Beranda, Buat Klip, Proyek, Pengaturan.
- Impor satu video lokal dengan dialog native Tauri atau drag-and-drop. Pada mode browser, gunakan file picker HTML / drag-and-drop browser.
- Preview dengan kontrol pemutaran, nama file, durasi, serta pesan kegagalan codec.
- Area preview 9:16, 16:9, dan 1:1; video menggunakan `object-fit: contain` sehingga perubahan rasio **belum memotong video**.
- Penanganan pembatalan dialog, ekstensi tidak didukung, dan pelepasan object URL browser saat penggantian video.

**Belum tersedia:** AI Clip Finder, Smart Framing, subtitle, editor manual, pemotongan, ekspor, dan penyimpanan proyek. Kartu modul diberi status “Direncanakan · belum aktif”. Tidak ada model AI, layanan cloud, atau pengunggahan video dalam implementasi ini. Impor bersifat sementara selama sesi aplikasi.

## Menjalankan di Windows

Prasyarat:

1. Windows 10/11 x64 dan Microsoft Edge WebView2 Runtime.
2. Node.js 22 LTS dan npm.
3. Rust stable (`rustup`, toolchain MSVC `x86_64-pc-windows-msvc`).
4. Visual Studio Build Tools 2022 dengan workload **Desktop development with C++**, MSVC dan Windows SDK.

Lihat [prasyarat Tauri 2](https://v2.tauri.app/start/prerequisites/). Dari root checkout:

```powershell
npm ci
npm run tauri dev
```

Frontend saja, tanpa Rust/WebView native:

```powershell
npm run dev
```

Mode frontend membantu pengembangan UI; dialog native, izin Tauri, dan asset protocol hanya berjalan di aplikasi desktop.

## Pemeriksaan dan build

```powershell
npm run check
npm run build
npx playwright install chromium
npm run test:browser
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --locked --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --bundles nsis --ci -- --locked
```

`-- --locked` terakhir diteruskan oleh CLI Tauri kepada Cargo. Lockfile npm dan Cargo disertakan. Build Rust harus memakai toolchain stable yang kompatibel dengan dependency dalam Cargo.lock.

Installer berada di `src-tauri/target/release/bundle/nsis/*.exe`. Installer menggunakan mode **currentUser** dan bootstrapper WebView2 jika runtime belum terpasang, sehingga instalasi pada perangkat tersebut memerlukan Internet. Installer belum ditandatangani dengan sertifikat code signing; Windows SmartScreen dapat menampilkan peringatan.

Pada Linux, kompilasi desktop memerlukan GTK 3, WebKitGTK 4.1, librsvg, toolchain C/C++ dan prasyarat Tauri Linux lainnya. Linux bukan target installer proyek ini.

## GitHub Actions

Workflow `.github/workflows/windows.yml` berjalan saat PR ke `main`, push ke `main`, tag `v*`, atau **workflow_dispatch**. Runner `windows-latest` menyiapkan Node 22 dan Rust stable, memasang dependency terkunci, menjalankan pemeriksaan JS, smoke test Chromium, rustfmt, cargo check, lalu membangun NSIS.

Setelah job berhasil, buka **Actions → Build Windows installer → run → Artifacts → OpenClipper-Custom-Windows-NSIS**. Artifact ZIP berisi installer `.exe`; tidak otomatis menerbitkan GitHub Release. Upload gagal jika tidak ada `.exe`. PR dari fork tetap memakai permission `contents: read` dan tidak memerlukan secret aplikasi.

## Struktur file

| File                                           | Peran                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `index.html`                                   | Struktur dashboard dan empat halaman, label Indonesia, live status, kontrol preview.      |
| `src/style.css`                                | Tema gelap, tata letak responsif, fokus keyboard, dan rasio preview.                      |
| `src/main.js`                                  | Navigasi, interaksi UI, dialog Tauri, drag-and-drop desktop/browser, lifecycle video.     |
| `src/modules/video.js`                         | Daftar ekstensi, validasi nama file, format durasi, normalisasi nama path.                |
| `src/modules/features.js`                      | Registry modul masa depan, tanpa eksekusi AI.                                             |
| `vite.config.js`                               | Port dev tetap 1420 dan bundling frontend ke `dist`.                                      |
| `package.json`, `package-lock.json`            | Perintah pengembangan/pengujian dan dependency JS terkunci.                               |
| `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` | Metadata v0.1.0, dependency Rust Tauri 2, dialog, dan asset protocol.                     |
| `src-tauri/build.rs`                           | Build hook resmi `tauri_build::build`.                                                    |
| `src-tauri/src/main.rs`                        | Entry point desktop dan registrasi plugin dialog.                                         |
| `src-tauri/tauri.conf.json`                    | Konfigurasi Tauri 2, jendela, CSP, frontend, asset protocol, dan NSIS.                    |
| `src-tauri/capabilities/default.json`          | Capability jendela `main`: core default dan membuka dialog.                               |
| `src-tauri/icons/icon.png`, `icon.ico`         | Ikon aplikasi RGBA dan resource installer Windows.                                        |
| `tests/video.test.js`                          | Dua pengujian utilitas durasi, ekstensi, dan path Windows.                                |
| `tests/browser-smoke.mjs`                      | Smoke test navigasi, impor, durasi, playback, rasio, drag-and-drop, dan file tidak valid. |
| `tests/fixtures/two-seconds.webm`              | Video warna sintetis 2 detik untuk pengujian, tanpa konten pengguna.                      |
| `.github/workflows/windows.yml`                | Pemeriksaan dan build/upload installer Windows NSIS.                                      |
| `.gitignore`                                   | Aturan lama dipertahankan; tambahan untuk dependency dan output frontend/Tauri.           |
| `README.md`                                    | Petunjuk penggunaan, arsitektur, pengujian, dan batasan.                                  |

## Batas integrasi berikutnya

`src/modules/video.js` memisahkan logika media dari UI, sementara `features.js` menjadi registry kemampuan. Tahap berikutnya dapat menambahkan modul terpisah untuk penemuan klip AI, framing, subtitle, dan timeline manual. Setiap modul harus menyatakan status kemampuan dan hanya ditampilkan aktif setelah benar-benar tersedia. Operasi berat dapat ditambahkan sebagai command Rust dengan capability minimal, progres, pembatalan dan penanganan error; belum ada command pemrosesan pada versi ini.

Asset protocol dimulai dengan scope kosong. Dialog plugin dan event drop Tauri menambahkan akses ke path yang secara eksplisit dipilih pengguna; aplikasi tidak mengizinkan pembacaan seluruh filesystem. CSP membatasi sumber aplikasi dan media lokal/blob. Ekstensi video hanya pemeriksaan awal, bukan jaminan codec; kompatibilitas pemutaran mengikuti WebView2 dan codec Windows. MKV/MOV/AVI dapat gagal dipreview. Aplikasi tidak melakukan transcoding.

## Hasil validasi cloud

- Instalasi `npm ci`, pemeriksaan sintaks, **2 pengujian utilitas**, dan build produksi Vite berhasil.
- Smoke test berhasil di Chromium Linux memakai fixture WebM: navigasi, picker, durasi 0:02, playback, 3 rasio, drop, penolakan file tidak valid; tidak ada error JavaScript.
- Konfigurasi valid terhadap `config.schema.json` dari CLI Tauri 2; `cargo fmt --check` berhasil.
- `cargo check --locked` Linux terhenti pada library sistem `glib-2.0` yang tidak tersedia. Pemasangan prasyarat dengan apt ditolak oleh izin akun cloud. Ini bukan hasil build Windows.
- Installer Windows, dialog native Windows, drag-and-drop native, dan instalasi pada Windows 10/11 **belum diverifikasi di cloud Linux**. Keberhasilan artifact harus dikonfirmasi dari run GitHub Actions, kemudian diuji manual di Windows.

Untuk mengulang smoke test dengan Chromium sistem, atur `CHROMIUM_PATH` ke executable browser (cloud Linux: `/usr/bin/chromium`). Tanpa override, Playwright memakai browser yang dipasang melalui `npx playwright install chromium`. Test memulai dan menghentikan server Vite sendiri di port 1421.
