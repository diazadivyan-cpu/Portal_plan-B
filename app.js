// =========================================================================
// KONFIGURASI SUPABASE & QRIS STATIS R3S
// =========================================================================
const SUPABASE_URL = 'https://qcubdkuaulqxubaqstig.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_z-_A8JehPezgUXRzBqdS0w_OueUx3Cx';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATIC_QRIS_R3S = '00020101021126610014COM.GO-JEK.WWW01189360091435873754230210G5873754230303UMI51440014ID.CO.QRIS.WWW0215ID10254635538060303UMI5204569753033605802ID5915Mas_hy, Fashion6007CIREBON61054518562070703A016304BDA1';

// State Global
let currentProfile = null;
let currentCoords = null;
let mediaStream = null;
let resetTargetUserId = null;
let qrisTimerInterval = null;

// =========================================================================
// HELPER GENERATOR QRIS DINAMIS (CRC16-CCITT)
// =========================================================================
function hitungCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function buatStringQRISDinamis(staticQris, nominal) {
  const nominalStr = String(Math.round(Number(nominal)));
  let qris = staticQris.replace('010211', '010212');
  qris = qris.slice(0, -4);
  const tag54 = '54' + String(nominalStr.length).padStart(2, '0') + nominalStr;
  const idx58 = qris.indexOf('5802ID');
  if (idx58 !== -1) {
    qris = qris.slice(0, idx58) + tag54 + qris.slice(idx58);
  }
  return qris + hitungCRC16(qris);
}

// =========================================================================
// 1. JAM DIGITAL & TANGGAL REAL-TIME GLOBAL (WIB - SEMUA AKUN)
// =========================================================================
function startGlobalClock() {
  const clockEl = document.getElementById('global-clock');
  function updateClock() {
    const now = new Date();
    const tanggalStr = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(now);
    const jamStr = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now).replace(/\./g, ':');
    clockEl.textContent = `${tanggalStr} | ${jamStr} WIB`;
  }
  updateClock();
  setInterval(updateClock, 1000);
}

// =========================================================================
// 2. LOGIN & LUPA KATA SANDI BERBASIS USERNAME
// =========================================================================
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .maybeSingle();

  if (error || !profile) {
    errEl.textContent = 'Username atau kata sandi salah!';
    return;
  }

  localStorage.setItem('r3s_session_id', profile.id);
  await initSession(profile);
});

document.getElementById('btn-show-forgot').addEventListener('click', () => {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('forgot-box').classList.remove('hidden');
  document.getElementById('form-buat-sandi-baru').classList.add('hidden');
  document.getElementById('forgot-msg').textContent = '';
});

document.getElementById('btn-back-login').addEventListener('click', () => {
  document.getElementById('forgot-box').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('login-error').textContent = '';
});

document.getElementById('form-cek-username').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('forgot-username').value.trim();
  const msgEl = document.getElementById('forgot-msg');
  msgEl.textContent = '';

  const { data: user, error } = await supabaseClient
    .from('profiles')
    .select('id, nama, username')
    .eq('username', username)
    .maybeSingle();

  if (error || !user) {
    msgEl.textContent = '❌ Username tidak ditemukan dalam sistem R3S.';
    return;
  }

  resetTargetUserId = user.id;
  await supabaseClient.from('profiles').update({ password: '' }).eq('id', user.id);

  document.getElementById('reset-user-label').textContent = `Akun ditemukan: ${user.nama} (@${user.username}). Silakan buat sandi baru:`;
  document.getElementById('form-buat-sandi-baru').classList.remove('hidden');
});

document.getElementById('form-buat-sandi-baru').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPass = document.getElementById('reset-new-password').value;
  const confirmPass = document.getElementById('reset-confirm-password').value;
  const msgEl = document.getElementById('forgot-msg');

  if (newPass !== confirmPass) {
    msgEl.textContent = '❌ Konfirmasi kata sandi tidak cocok!';
    return;
  }

  const { error } = await supabaseClient
    .from('profiles')
    .update({ password: newPass })
    .eq('id', resetTargetUserId);

  if (error) {
    msgEl.textContent = 'Gagal menyimpan sandi baru: ' + error.message;
  } else {
    alert('✅ Kata sandi berhasil direset dan diperbarui! Silakan login dengan sandi baru Anda.');
    resetTargetUserId = null;
    e.target.reset();
    document.getElementById('btn-back-login').click();
  }
});

document.getElementById('btn-logout').addEventListener('click', () => {
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  localStorage.removeItem('r3s_session_id');
  location.reload();
});

// =========================================================================
// 3. INISIALISASI SESI, AVATAR & MENU 4 ROLE
// =========================================================================
function applyProfileUI(profile) {
  currentProfile = profile;
  const avatarSrc = profile.avatar_url || 'R3S logo/logo-r3s.jpg';
  document.getElementById('sidebar-avatar').src = avatarSrc;
  document.getElementById('sidebar-nama').textContent = profile.nama;
  document.getElementById('sidebar-npm').textContent = `NPM: ${profile.npm}`;
  document.getElementById('sidebar-username').textContent = `@${profile.username}`;
  document.getElementById('badge-role').textContent = profile.role;
}

async function initSession(profile) {
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');

  applyProfileUI(profile);
  startGlobalClock();
  renderNavigationByRole(profile.role);
  await loadDashboardData();
}

function renderNavigationByRole(role) {
  const navMenu = document.getElementById('nav-menu');
  const menus = [
    { id: 'tab-dashboard', label: '🏠 Dashboard & Kas', roles: ['admin', 'ketua', 'bendahara', 'mahasiswa'] },
    { id: 'tab-absen-mahasiswa', label: '📸 Absen Selfie & Izin', roles: ['mahasiswa', 'ketua', 'bendahara', 'admin'] },
    { id: 'tab-kas-mahasiswa', label: '💰 Tagihan Kas Saya', roles: ['mahasiswa', 'ketua', 'bendahara', 'admin'] },
    { id: 'tab-kelola-absensi', label: '📋 Kelola Sesi & Absensi', roles: ['ketua', 'admin'] },
    { id: 'tab-kelola-kas', label: '🏦 Bendahara & Buku Kas', roles: ['bendahara', 'admin'] },
    { id: 'tab-admin-users', label: '⚙️ Kelola Akun & Sandi', roles: ['admin'] },
    { id: 'tab-profil-saya', label: '👤 Profil & Foto Akun', roles: ['admin', 'ketua', 'bendahara', 'mahasiswa'] }
  ];

  navMenu.innerHTML = '';
  menus.filter(m => m.roles.includes(role)).forEach((menu, index) => {
    const btn = document.createElement('button');
    btn.className = `nav-item ${index === 0 ? 'active' : ''}`;
    btn.textContent = menu.label;
    btn.onclick = () => switchTab(menu.id, menu.label, btn);
    navMenu.appendChild(btn);
  });
}

function switchTab(tabId, title, btnEl) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.remove('hidden');
  btnEl.classList.add('active');
  document.getElementById('page-title').textContent = title;
  document.getElementById('sidebar').classList.remove('open');

  if (tabId === 'tab-dashboard') loadDashboardData();
  if (tabId === 'tab-absen-mahasiswa') prepareStudentAttendance();
  if (tabId === 'tab-kas-mahasiswa') loadMyBills();
  if (tabId === 'tab-kelola-absensi') loadKetuaAttendanceData();
  if (tabId === 'tab-kelola-kas') loadBendaharaData();
  if (tabId === 'tab-admin-users') {
    loadAdminUsers();
    loadAdminBankSettings();
  }
  if (tabId === 'tab-profil-saya') loadMyProfileForm();
}

document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// =========================================================================
// 4. PENGATURAN PROFIL MANDIRI (GANTI FOTO PROFIL, USERNAME & SANDI)
// =========================================================================
function loadMyProfileForm() {
  document.getElementById('profil-avatar-preview').src = currentProfile.avatar_url || 'R3S logo/logo-r3s.jpg';
  document.getElementById('profil-avatar-file').value = '';
  document.getElementById('profil-nama').value = currentProfile.nama;
  document.getElementById('profil-npm').value = currentProfile.npm;
  document.getElementById('profil-username').value = currentProfile.username;
  document.getElementById('profil-password').value = currentProfile.password;
}

document.getElementById('profil-avatar-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert('Ukuran foto maksimal 2MB!');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('profil-avatar-preview').src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('form-update-profil').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btnSave = document.getElementById('btn-save-profil');
  btnSave.disabled = true;
  btnSave.textContent = 'Menyimpan...';

  const newUsername = document.getElementById('profil-username').value.trim();
  const newPassword = document.getElementById('profil-password').value;
  const avatarFile = document.getElementById('profil-avatar-file').files[0];

  let updatedAvatarUrl = currentProfile.avatar_url;

  if (avatarFile) {
    const ext = avatarFile.name.split('.').pop();
    const fileName = `avatar_${currentProfile.id}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseClient.storage
      .from('bukti_r3s')
      .upload(fileName, avatarFile, { upsert: true });

    if (upErr) {
      alert('Gagal mengunggah foto profil: ' + upErr.message);
      btnSave.disabled = false;
      btnSave.textContent = 'Simpan Perubahan Profil';
      return;
    }

    updatedAvatarUrl = supabaseClient.storage.from('bukti_r3s').getPublicUrl(fileName).data.publicUrl;
  }

  const { data, error } = await supabaseClient
    .from('profiles')
    .update({
      username: newUsername,
      password: newPassword,
      avatar_url: updatedAvatarUrl
    })
    .eq('id', currentProfile.id)
    .select()
    .single();

  btnSave.disabled = false;
  btnSave.textContent = 'Simpan Perubahan Profil';

  if (error) {
    alert('Gagal memperbarui profil (Username mungkin sudah dipakai): ' + error.message);
  } else {
    applyProfileUI(data);
    alert('✅ Foto profil, username, dan kata sandi Anda berhasil diperbarui!');
  }
});

// =========================================================================
// 5. KHUSUS ADMIN: BUAT AKUN BARU, LIHAT SANDI & UBAH SANDI SEMUA ROLE
// =========================================================================
async function loadAdminUsers() {
  const { data: users, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .order('npm', { ascending: true });

  const tbody = document.getElementById('tbody-admin-users');
  tbody.innerHTML = '';

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7">Gagal memuat daftar akun: ${error.message}</td></tr>`;
    return;
  }

  (users || []).forEach(u => {
    const avatar = u.avatar_url || 'R3S logo/logo-r3s.jpg';
    const safeNama = (u.nama || '').replace(/'/g, "\\'");
    const safeUsername = (u.username || '').replace(/'/g, "\\'");
    const safePwd = (u.password || '').replace(/'/g, "\\'");

    tbody.innerHTML += `
      <tr>
        <td><img src="${avatar}" alt="Avatar" class="table-avatar" /></td>
        <td>${u.npm}</td>
        <td>${u.nama}</td>
        <td>@${u.username}</td>
        <td>
          <span id="pwd-text-${u.id}" class="pwd-mask" data-pwd="${u.password || ''}" data-visible="false">••••••••</span>
          <button type="button" class="btn-cyan-outline btn-sm" onclick="toggleLihatSandi('${u.id}')">👁️</button>
        </td>
        <td>
          <select onchange="ubahRoleUser('${u.id}', this.value)">
            <option value="mahasiswa" ${u.role === 'mahasiswa' ? 'selected' : ''}>Mahasiswa</option>
            <option value="ketua" ${u.role === 'ketua' ? 'selected' : ''}>Ketua Kelas</option>
            <option value="bendahara" ${u.role === 'bendahara' ? 'selected' : ''}>Bendahara</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </td>
        <td>
          <button type="button" class="btn-nebula-outline btn-sm" onclick="bukaModalUbahSandi('${u.id}', '${safeNama}', '${safeUsername}', '${safePwd}')">🔑 Ubah Sandi</button>
        </td>
      </tr>`;
  });
}

document.getElementById('form-admin-create-user').addEventListener('submit', async (e) => {
  e.preventDefault();
  const npm = document.getElementById('new-npm').value.trim();
  const nama = document.getElementById('new-nama').value.trim();
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;

  const { error } = await supabaseClient.from('profiles').insert({
    npm,
    nama,
    username,
    password,
    role
  });

  if (error) {
    alert('Gagal membuat akun: ' + error.message);
  } else {
    alert(`✅ Akun baru untuk ${nama} (@${username}) berhasil dibuat!`);
    e.target.reset();
    loadAdminUsers();
  }
});

async function loadAdminBankSettings() {
  const { data } = await supabaseClient
    .from('pengaturan_pembayaran')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (data) {
    document.getElementById('admin-nama-bank').value = data.nama_bank;
    document.getElementById('admin-no-rek').value = data.no_rekening;
    document.getElementById('admin-atas-nama').value = data.atas_nama;
  }
}

document.getElementById('form-admin-rekening').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama_bank = document.getElementById('admin-nama-bank').value.trim();
  const no_rekening = document.getElementById('admin-no-rek').value.trim();
  const atas_nama = document.getElementById('admin-atas-nama').value.trim();

  const { error } = await supabaseClient
    .from('pengaturan_pembayaran')
    .upsert({
      id: 1,
      nama_bank,
      no_rekening,
      atas_nama,
      updated_at: new Date().toISOString()
    });

  if (error) alert('Gagal menyimpan rekening: ' + error.message);
  else alert('✅ Pengaturan Bank & Nomor Rekening kelas berhasil diperbarui!');
});

window.toggleLihatSandi = (userId) => {
  const span = document.getElementById(`pwd-text-${userId}`);
  const isVisible = span.getAttribute('data-visible') === 'true';
  if (isVisible) {
    span.textContent = '••••••••';
    span.setAttribute('data-visible', 'false');
  } else {
    span.textContent = span.getAttribute('data-pwd') || '(Kosong)';
    span.setAttribute('data-visible', 'true');
  }
};

window.bukaModalUbahSandi = (id, nama, username, currentPwd) => {
  document.getElementById('edit-sandi-userid').value = id;
  document.getElementById('modal-admin-user-info').textContent = `${nama} (@${username})`;
  document.getElementById('edit-sandi-baru').value = currentPwd;
  document.getElementById('modal-admin-sandi').classList.remove('hidden');
};

document.getElementById('btn-close-admin-modal').addEventListener('click', () => {
  document.getElementById('modal-admin-sandi').classList.add('hidden');
});

document.getElementById('form-admin-edit-sandi').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = document.getElementById('edit-sandi-userid').value;
  const newPwd = document.getElementById('edit-sandi-baru').value;

  const { error } = await supabaseClient.from('profiles').update({ password: newPwd }).eq('id', userId);
  if (error) alert('Gagal mengubah sandi: ' + error.message);
  else {
    alert('✅ Kata sandi akun berhasil diperbarui oleh Admin!');
    document.getElementById('modal-admin-sandi').classList.add('hidden');
    loadAdminUsers();
  }
});

window.ubahRoleUser = async (userId, newRole) => {
  const { error } = await supabaseClient.from('profiles').update({ role: newRole }).eq('id', userId);
  if (error) alert('Gagal mengubah role: ' + error.message);
  else alert(`✅ Role berhasil diubah menjadi ${newRole.toUpperCase()}`);
};

// =========================================================================
// 6. DASHBOARD, ABSENSI FOTO REAL-TIME & KETUA KELAS
// =========================================================================
async function loadDashboardData() {
  const { data: transaksi } = await supabaseClient
    .from('transaksi_kas')
    .select('*')
    .order('created_at', { ascending: false });

  let saldo = 0;
  const tbody = document.getElementById('tbody-mutasi-dashboard');
  tbody.innerHTML = '';

  (transaksi || []).forEach(t => {
    const nom = Number(t.nominal);
    saldo += t.jenis === 'Pemasukan' ? nom : -nom;
    const waktu = new Date(t.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    tbody.innerHTML += `
      <tr>
        <td>${waktu} WIB</td>
        <td><span class="${t.jenis === 'Pemasukan' ? 'text-cyan' : 'text-violet'}">${t.jenis}</span></td>
        <td>${t.keterangan}</td>
        <td>Rp ${nom.toLocaleString('id-ID')}</td>
      </tr>`;
  });
  document.getElementById('stat-saldo').textContent = `Rp ${saldo.toLocaleString('id-ID')}`;

  const { data: absenSaya } = await supabaseClient
    .from('absensi')
    .select('status')
    .eq('mahasiswa_id', currentProfile.id);

  const total = (absenSaya || []).length;
  const hadir = (absenSaya || []).filter(a => a.status === 'Hadir').length;
  const izinSakit = (absenSaya || []).filter(a => a.status === 'Izin' || a.status === 'Sakit').length;
  const alpha = (absenSaya || []).filter(a => a.status === 'Alpha').length;
  const persen = total > 0 ? Math.round((hadir / total) * 100) : 100;

  document.getElementById('stat-kehadiran').textContent = `${persen}%`;
  document.getElementById('stat-kehadiran-detail').textContent = `${hadir} Hadir | ${izinSakit} Izin/Sakit | ${alpha} Alpha`;

  const { data: tagihan } = await supabaseClient
    .from('iuran_kas')
    .select('nominal, status')
    .eq('mahasiswa_id', currentProfile.id)
    .neq('status', 'Lunas');

  const totalTunggakan = (tagihan || []).reduce((acc, item) => acc + Number(item.nominal), 0);
  document.getElementById('stat-tunggakan').textContent = `Rp ${totalTunggakan.toLocaleString('id-ID')}`;
  document.getElementById('stat-tunggakan-info').textContent = `${(tagihan || []).length} periode belum lunas`;
}

async function prepareStudentAttendance() {
  const { data: sesi } = await supabaseClient
    .from('sesi_absensi')
    .select('*')
    .eq('status', 'aktif')
    .order('created_at', { ascending: false });

  const selectSesi = document.getElementById('select-sesi-aktif');
  const selectIzin = document.getElementById('izin-sesi-id');
  selectSesi.innerHTML = '';
  selectIzin.innerHTML = '';

  if (!sesi || sesi.length === 0) {
    selectSesi.innerHTML = '<option value="">Tidak ada sesi absensi aktif saat ini</option>';
  } else {
    sesi.forEach(s => {
      const opt = `<option value="${s.id}">${s.mata_kuliah} (${s.tanggal})</option>`;
      selectSesi.innerHTML += opt;
      selectIzin.innerHTML += opt;
    });
  }

  const gpsBox = document.getElementById('gps-status-box');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentCoords = { lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) };
      gpsBox.innerHTML = `✅ Lokasi Terkunci: <strong>${currentCoords.lat}, ${currentCoords.lng}</strong>`;
    },
    () => {
      gpsBox.textContent = '⚠️ Gagal mengambil lokasi GPS. Aktifkan izin lokasi browser!';
    },
    { enableHighAccuracy: true }
  );
}

document.getElementById('btn-start-camera').addEventListener('click', async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const video = document.getElementById('camera-video');
    video.srcObject = mediaStream;
    document.getElementById('btn-capture-photo').disabled = false;
  } catch (err) {
    alert('Akses kamera ditolak: ' + err.message);
  }
});

document.getElementById('btn-capture-photo').addEventListener('click', async () => {
  const sesiId = document.getElementById('select-sesi-aktif').value;
  if (!sesiId) return alert('Pilih sesi mata kuliah aktif terlebih dahulu!');
  if (!currentCoords) return alert('Tunggu hingga koordinat GPS terkunci!');

  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('watermark-canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(3, 19, 43, 0.78)';
  ctx.fillRect(0, canvas.height - 85, canvas.width, 85);

  const waktuSekarang = document.getElementById('global-clock').textContent;
  ctx.fillStyle = '#00d4ff';
  ctx.font = 'bold 15px Plus Jakarta Sans, sans-serif';
  ctx.fillText(`KELAS R3S | ${currentProfile.nama} (${currentProfile.npm})`, 14, canvas.height - 56);

  ctx.fillStyle = '#f0f8ff';
  ctx.font = '13px Plus Jakarta Sans, sans-serif';
  ctx.fillText(`🕒 ${waktuSekarang}`, 14, canvas.height - 34);
  ctx.fillText(`📍 GPS: ${currentCoords.lat}, ${currentCoords.lng}`, 14, canvas.height - 14);

  const preview = document.getElementById('photo-preview');
  preview.src = canvas.toDataURL('image/jpeg', 0.72);
  preview.classList.remove('hidden');
  video.classList.add('hidden');

  canvas.toBlob(async (blob) => {
    const fileName = `absen_${currentProfile.npm}_${Date.now()}.jpg`;
    const { error: upErr } = await supabaseClient.storage.from('bukti_r3s').upload(fileName, blob);
    if (upErr) return alert('Gagal upload foto: ' + upErr.message);

    const { data: pubUrl } = supabaseClient.storage.from('bukti_r3s').getPublicUrl(fileName);
    const { error: dbErr } = await supabaseClient.from('absensi').insert({
      sesi_id: sesiId,
      mahasiswa_id: currentProfile.id,
      status: 'Hadir',
      keterangan: 'Absen Selfie Real-Time',
      foto_url: pubUrl.publicUrl,
      latitude: parseFloat(currentCoords.lat),
      longitude: parseFloat(currentCoords.lng),
      waktu_absen: new Date().toISOString()
    });

    if (dbErr) alert('Gagal mencatat absensi: ' + dbErr.message);
    else {
      alert('✅ Absensi Real-Time berhasil dicatat!');
      if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
      await loadDashboardData();
    }
  }, 'image/jpeg', 0.72);
});

document.getElementById('form-pengajuan-izin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sesiId = document.getElementById('izin-sesi-id').value;
  const jenis = document.getElementById('izin-jenis').value;
  const alasan = document.getElementById('izin-alasan').value;
  const fileInput = document.getElementById('izin-file').files[0];

  let buktiUrl = null;
  if (fileInput) {
    const fileName = `izin_${currentProfile.npm}_${Date.now()}.jpg`;
    const { error } = await supabaseClient.storage.from('bukti_r3s').upload(fileName, fileInput);
    if (!error) buktiUrl = supabaseClient.storage.from('bukti_r3s').getPublicUrl(fileName).data.publicUrl;
  }

  const { error } = await supabaseClient.from('pengajuan_izin').insert({
    mahasiswa_id: currentProfile.id,
    sesi_id: sesiId,
    jenis,
    alasan,
    bukti_url: buktiUrl
  });

  if (error) alert('Gagal mengajukan izin: ' + error.message);
  else {
    alert('✅ Pengajuan izin/sakit berhasil dikirim!');
    e.target.reset();
  }
});

document.getElementById('form-buat-sesi').addEventListener('submit', async (e) => {
  e.preventDefault();
  const matkul = document.getElementById('sesi-matkul').value;
  const batas = document.getElementById('sesi-batas').value;

  const { error } = await supabaseClient.from('sesi_absensi').insert({
    mata_kuliah: matkul,
    batas_waktu: new Date(batas).toISOString(),
    dibuat_oleh: currentProfile.id
  });

  if (error) alert('Gagal membuka sesi: ' + error.message);
  else {
    alert('✅ Sesi absensi dibuka!');
    e.target.reset();
    loadKetuaAttendanceData();
  }
});

document.getElementById('form-manual-absensi').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sesiId = document.getElementById('manual-sesi-id').value;
  const mhsId = document.getElementById('manual-mhs-id').value;
  const status = document.getElementById('manual-status').value;
  const keterangan = document.getElementById('manual-keterangan').value.trim() || `Diinput manual oleh ${currentProfile.role}`;

  if (!sesiId || !mhsId) return alert('Pilih sesi mata kuliah dan mahasiswa terlebih dahulu!');

  const { error } = await supabaseClient.from('absensi').upsert({
    sesi_id: sesiId,
    mahasiswa_id: mhsId,
    status,
    keterangan,
    waktu_absen: new Date().toISOString()
  }, { onConflict: 'sesi_id,mahasiswa_id' });

  if (error) {
    alert('Gagal menyimpan absensi manual: ' + error.message);
  } else {
    alert('✅ Data absensi manual berhasil disimpan!');
    e.target.reset();
    loadKetuaAttendanceData();
    loadDashboardData();
  }
});

async function loadKetuaAttendanceData() {
  const { data: allSesi } = await supabaseClient
    .from('sesi_absensi')
    .select('id, mata_kuliah, tanggal')
    .order('created_at', { ascending: false });

  const manualSesiSelect = document.getElementById('manual-sesi-id');
  manualSesiSelect.innerHTML = '';
  (allSesi || []).forEach(s => {
    manualSesiSelect.innerHTML += `<option value="${s.id}">${s.mata_kuliah} (${s.tanggal})</option>`;
  });

  const { data: allUsers } = await supabaseClient
    .from('profiles')
    .select('id, npm, nama')
    .order('npm', { ascending: true });

  const manualMhsSelect = document.getElementById('manual-mhs-id');
  manualMhsSelect.innerHTML = '';
  (allUsers || []).forEach(u => {
    manualMhsSelect.innerHTML += `<option value="${u.id}">${u.npm} - ${u.nama}</option>`;
  });

  const { data: izinList } = await supabaseClient
    .from('pengajuan_izin')
    .select('*, profiles(nama, npm), sesi_absensi(mata_kuliah)')
    .eq('status_verifikasi', 'Pending');

  const tbodyIzin = document.getElementById('tbody-verifikasi-izin');
  tbodyIzin.innerHTML = '';
  (izinList || []).forEach(item => {
    tbodyIzin.innerHTML += `
      <tr>
        <td>${item.profiles?.nama} (${item.profiles?.npm})</td>
        <td>${item.sesi_absensi?.mata_kuliah}</td>
        <td><strong>${item.jenis}</strong>: ${item.alasan}</td>
        <td>${item.bukti_url ? `<a href="${item.bukti_url}" target="_blank" class="text-cyan">Bukti</a>` : '-'}</td>
        <td>
          <button class="btn-galaxy-submit btn-sm" onclick="prosesIzin('${item.id}', '${item.mahasiswa_id}', '${item.sesi_id}', '${item.jenis}', '${item.alasan.replace(/'/g, "\\'")}', 'Disetujui')">Setujui</button>
          <button class="btn-nebula-outline btn-sm" onclick="prosesIzin('${item.id}', null, null, null, null, 'Ditolak')">Tolak</button>
        </td>
      </tr>`;
  });

  const { data: absenList } = await supabaseClient
    .from('absensi')
    .select('*, profiles(nama, npm), sesi_absensi(mata_kuliah)')
    .order('waktu_absen', { ascending: false });

  const tbodyAbsen = document.getElementById('tbody-monitoring-absensi');
  tbodyAbsen.innerHTML = '';
  (absenList || []).forEach(a => {
    const waktu = new Date(a.waktu_absen).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const mapsLink = a.latitude ? `https://maps.google.com/?q=${a.latitude},${a.longitude}` : '#';
    const safeNama = (a.profiles?.nama || '').replace(/'/g, "\\'");
    const safeMatkul = (a.sesi_absensi?.mata_kuliah || '').replace(/'/g, "\\'");
    const safeKet = (a.keterangan || '').replace(/'/g, "\\'");

    tbodyAbsen.innerHTML += `
      <tr>
        <td>${waktu} WIB</td>
        <td>${a.profiles?.npm} - ${a.profiles?.nama}</td>
        <td>${a.sesi_absensi?.mata_kuliah}</td>
        <td><strong>${a.status}</strong><br><small class="text-muted">${a.keterangan || '-'}</small></td>
        <td>
          ${a.foto_url ? `<a href="${a.foto_url}" target="_blank" class="text-cyan">📷 Foto</a>` : '-'} |
          ${a.latitude ? `<a href="${mapsLink}" target="_blank" class="text-violet">📍 Maps</a>` : '-'}
        </td>
        <td>
          <button type="button" class="btn-cyan-outline btn-sm" onclick="bukaModalEditAbsen('${a.id}', '${safeNama}', '${safeMatkul}', '${a.status}', '${safeKet}')">✏️ Edit</button>
          <button type="button" class="btn-nebula-outline btn-sm" onclick="hapusAbsensi('${a.id}')">🗑️</button>
        </td>
      </tr>`;
  });
}

window.bukaModalEditAbsen = (id, nama, matkul, status, keterangan) => {
  document.getElementById('edit-absen-id').value = id;
  document.getElementById('modal-edit-absen-info').textContent = `${nama} — ${matkul}`;
  document.getElementById('edit-absen-status').value = status;
  document.getElementById('edit-absen-keterangan').value = keterangan;
  document.getElementById('modal-edit-absensi').classList.remove('hidden');
};

document.getElementById('btn-close-edit-absen').addEventListener('click', () => {
  document.getElementById('modal-edit-absensi').classList.add('hidden');
});

document.getElementById('form-edit-absensi').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-absen-id').value;
  const status = document.getElementById('edit-absen-status').value;
  const keterangan = document.getElementById('edit-absen-keterangan').value.trim();

  const { error } = await supabaseClient
    .from('absensi')
    .update({ status, keterangan })
    .eq('id', id);

  if (error) {
    alert('Gagal memperbarui absensi: ' + error.message);
  } else {
    alert('✅ Data absensi berhasil diperbarui!');
    document.getElementById('modal-edit-absensi').classList.add('hidden');
    loadKetuaAttendanceData();
    loadDashboardData();
  }
});

window.hapusAbsensi = async (id) => {
  if (!confirm('Yakin ingin menghapus catatan absensi ini?')) return;
  const { error } = await supabaseClient.from('absensi').delete().eq('id', id);
  if (error) alert('Gagal menghapus absensi: ' + error.message);
  else {
    alert('🗑️ Catatan absensi dihapus.');
    loadKetuaAttendanceData();
    loadDashboardData();
  }
};

window.prosesIzin = async (izinId, mhsId, sesiId, jenis, alasan, keputusan) => {
  await supabaseClient.from('pengajuan_izin').update({ status_verifikasi: keputusan }).eq('id', izinId);
  if (keputusan === 'Disetujui') {
    await supabaseClient.from('absensi').upsert({
      sesi_id: sesiId,
      mahasiswa_id: mhsId,
      status: jenis,
      keterangan: alasan,
      waktu_absen: new Date().toISOString()
    }, { onConflict: 'sesi_id,mahasiswa_id' });
  }
  loadKetuaAttendanceData();
  loadDashboardData();
};

// =========================================================================
// 7. UANG KAS, QRIS DINAMIS (BISA UBAH NOMINAL) & TRANSFER BANK
// =========================================================================
async function loadMyBills() {
  const { data } = await supabaseClient
    .from('iuran_kas')
    .select('*')
    .eq('mahasiswa_id', currentProfile.id)
    .order('created_at', { ascending: false });

  const tbody = document.getElementById('tbody-tagihan-saya');
  tbody.innerHTML = '';
  (data || []).forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td>${item.periode}</td>
        <td>Rp ${Number(item.nominal).toLocaleString('id-ID')}</td>
        <td>${item.status}</td>
        <td>
          ${item.status === 'Belum Lunas'
            ? `<button class="btn-ocean btn-sm" onclick="openBayarModal('${item.id}', '${item.periode}', ${item.nominal})">Bayar Kas</button>`
            : '✔️'}
        </td>
      </tr>`;
  });
}

const btnTabQris = document.getElementById('btn-tab-qris');
const btnTabTransfer = document.getElementById('btn-tab-transfer');
const panelQris = document.getElementById('panel-metode-qris');
const panelTransfer = document.getElementById('panel-metode-transfer');

btnTabQris.addEventListener('click', () => {
  btnTabQris.classList.add('active');
  btnTabTransfer.classList.remove('active');
  panelQris.classList.remove('hidden');
  panelTransfer.classList.add('hidden');
  document.getElementById('bayar-metode-terpilih').value = 'QRIS Dinamis';
});

btnTabTransfer.addEventListener('click', () => {
  btnTabTransfer.classList.add('active');
  btnTabQris.classList.remove('active');
  panelTransfer.classList.remove('hidden');
  panelQris.classList.add('hidden');
  document.getElementById('bayar-metode-terpilih').value = 'Transfer Bank';
  document.getElementById('btn-submit-qris').disabled = false;
});

document.getElementById('btn-copy-rek').addEventListener('click', () => {
  const noRek = document.getElementById('display-no-rek').textContent;
  navigator.clipboard.writeText(noRek);
  alert(`📋 Nomor rekening ${noRek} berhasil disalin!`);
});

document.getElementById('btn-download-qris').addEventListener('click', () => {
  const canvas = document.querySelector('#qris-canvas-box canvas');
  const img = document.querySelector('#qris-canvas-box img');
  const link = document.createElement('a');
  link.download = `QRIS_Kas_R3S_${Date.now()}.png`;
  if (canvas) {
    link.href = canvas.toDataURL('image/png');
    link.click();
  } else if (img) {
    link.href = img.src;
    link.click();
  }
});

// Render Gambar QRIS Sesuai Nominal Terbaru
function renderQRISCode(nominal) {
  const qrisBox = document.getElementById('qris-canvas-box');
  qrisBox.innerHTML = '';

  const nominalValid = Number(nominal);
  if (!nominalValid || nominalValid < 1000) {
    qrisBox.innerHTML = '<p style="color:#050a18;font-size:12px;padding:20px;">Minimal nominal pembayaran Rp 1.000</p>';
    return;
  }

  const dynamicQrisString = buatStringQRISDinamis(STATIC_QRIS_R3S, nominalValid);
  new QRCode(qrisBox, {
    text: dynamicQrisString,
    width: 190,
    height: 190,
    colorDark: "#050a18",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
}

// Otomatis Perbarui QRIS Saat Mahasiswa Mengubah Angka Nominal
document.getElementById('input-nominal-qris').addEventListener('input', (e) => {
  const nominalBaru = Number(e.target.value);
  renderQRISCode(nominalBaru);
});

// Buka Modal Bayar
window.openBayarModal = async (id, periode, nominal) => {
  document.getElementById('bayar-iuran-id').value = id;
  document.getElementById('modal-kas-info').textContent = `${periode} — Tagihan: Rp ${Number(nominal).toLocaleString('id-ID')}`;

  const inputNominal = document.getElementById('input-nominal-qris');
  inputNominal.value = nominal;

  btnTabQris.click();

  const { data: bankData } = await supabaseClient
    .from('pengaturan_pembayaran')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (bankData) {
    document.getElementById('display-nama-bank').textContent = bankData.nama_bank;
    document.getElementById('display-no-rek').textContent = bankData.no_rekening;
    document.getElementById('display-atas-nama').textContent = bankData.atas_nama;
  }

  renderQRISCode(nominal);

  if (qrisTimerInterval) clearInterval(qrisTimerInterval);
  let sisaDetik = 300;
  const timerEl = document.getElementById('qris-countdown');
  const btnSubmit = document.getElementById('btn-submit-qris');
  btnSubmit.disabled = false;

  qrisTimerInterval = setInterval(() => {
    const menit = String(Math.floor(sisaDetik / 60)).padStart(2, '0');
    const detik = String(sisaDetik % 60).padStart(2, '0');
    timerEl.textContent = `${menit}:${detik}`;

    if (sisaDetik <= 0) {
      clearInterval(qrisTimerInterval);
      timerEl.textContent = 'KEDALUWARSA';
      if (!panelQris.classList.contains('hidden')) {
        document.getElementById('qris-canvas-box').innerHTML = '<p style="color:#050a18;font-size:12px;padding:20px;">Waktu QRIS habis.<br>Tutup & buka ulang atau pilih Transfer Bank.</p>';
        btnSubmit.disabled = true;
      }
    }
    sisaDetik--;
  }, 1000);

  document.getElementById('modal-bayar-kas').classList.remove('hidden');
};

// Simpan Bukti Pembayaran Beserta Nominal Aktual yang Dibayar
document.getElementById('form-upload-bayar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('bayar-iuran-id').value;
  const metode = document.getElementById('bayar-metode-terpilih').value;
  const nominalDibayar = Number(document.getElementById('input-nominal-qris').value);
  const file = document.getElementById('bayar-bukti-file').files[0];

  if (metode === 'QRIS Dinamis' && (!nominalDibayar || nominalDibayar < 1000)) {
    return alert('Masukkan nominal pembayaran minimal Rp 1.000!');
  }

  const fileName = `kas_${currentProfile.npm}_${Date.now()}.jpg`;
  const { error: upErr } = await supabaseClient.storage.from('bukti_r3s').upload(fileName, file);
  if (upErr) return alert('Gagal upload bukti bayar: ' + upErr.message);

  const pubUrl = supabaseClient.storage.from('bukti_r3s').getPublicUrl(fileName).data.publicUrl;
  const metodeLabel = metode === 'QRIS Dinamis'
    ? `QRIS Dinamis (Rp ${nominalDibayar.toLocaleString('id-ID')})`
    : metode;

  const { error: dbErr } = await supabaseClient.from('iuran_kas').update({
    status: 'Menunggu Verifikasi',
    metode_bayar: metodeLabel,
    bukti_bayar_url: pubUrl,
    waktu_bayar: new Date().toISOString()
  }).eq('id', id);

  if (dbErr) return alert('Gagal menyimpan status pembayaran: ' + dbErr.message);

  if (qrisTimerInterval) clearInterval(qrisTimerInterval);
  alert(`✅ Bukti bayar (${metodeLabel}) terkirim! Menunggu verifikasi Bendahara.`);
  e.target.reset();
  document.getElementById('modal-bayar-kas').classList.add('hidden');
  loadMyBills();
});

document.getElementById('btn-close-modal').addEventListener('click', () => {
  if (qrisTimerInterval) clearInterval(qrisTimerInterval);
  document.getElementById('modal-bayar-kas').classList.add('hidden');
});

document.getElementById('form-tagihan-massal').addEventListener('submit', async (e) => {
  e.preventDefault();
  const periode = document.getElementById('kas-periode').value;
  const nominal = Number(document.getElementById('kas-nominal').value);

  const { data: users } = await supabaseClient.from('profiles').select('id');
  const rows = (users || []).map(u => ({
    mahasiswa_id: u.id,
    periode,
    nominal,
    status: 'Belum Lunas'
  }));

  const { error } = await supabaseClient.from('iuran_kas').insert(rows);
  if (error) alert('Gagal menerbitkan tagihan: ' + error.message);
  else {
    alert(`✅ Tagihan "${periode}" diterbitkan untuk ${rows.length} akun!`);
    e.target.reset();
    loadBendaharaData();
  }
});

document.getElementById('form-transaksi-kas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const jenis = document.getElementById('trans-jenis').value;
  const nominal = Number(document.getElementById('trans-nominal').value);
  const keterangan = document.getElementById('trans-keterangan').value;

  const { error } = await supabaseClient.from('transaksi_kas').insert({
    jenis,
    nominal,
    keterangan,
    dicatat_oleh: currentProfile.id
  });

  if (error) alert('Gagal mencatat transaksi: ' + error.message);
  else {
    alert('✅ Transaksi kas dicatat!');
    e.target.reset();
    loadDashboardData();
  }
});

async function loadBendaharaData() {
  const { data } = await supabaseClient
    .from('iuran_kas')
    .select('*, profiles(nama, npm)')
    .order('created_at', { ascending: false });

  const tbody = document.getElementById('tbody-verifikasi-kas');
  tbody.innerHTML = '';
  (data || []).forEach(item => {
    const safeNama = (item.profiles?.nama || '').replace(/'/g, "\\'");
    const safePeriode = (item.periode || '').replace(/'/g, "\\'");
    tbody.innerHTML += `
      <tr>
        <td>${item.profiles?.npm} - ${item.profiles?.nama}</td>
        <td>${item.periode}</td>
        <td>Rp ${Number(item.nominal).toLocaleString('id-ID')}</td>
        <td>${item.status} ${item.metode_bayar ? `<br><small class="text-cyan">(${item.metode_bayar})</small>` : ''}</td>
        <td>
          ${item.bukti_bayar_url ? `<a href="${item.bukti_bayar_url}" target="_blank" class="text-cyan">Bukti</a> ` : ''}
          ${item.status !== 'Lunas'
            ? `<button class="btn-ocean btn-sm" onclick="verifikasiLunas('${item.id}', '${safeNama}', '${safePeriode}', ${item.nominal})">Sahkan Lunas</button>`
            : '✅ Lunas'}
        </td>
      </tr>`;
  });
}

window.verifikasiLunas = async (id, nama, periode, nominal) => {
  await supabaseClient.from('iuran_kas').update({
    status: 'Lunas',
    waktu_verifikasi: new Date().toISOString()
  }).eq('id', id);

  await supabaseClient.from('transaksi_kas').insert({
    jenis: 'Pemasukan',
    nominal,
    keterangan: `Iuran Kas (${periode}) - ${nama}`,
    dicatat_oleh: currentProfile.id
  });

  alert('✅ Pembayaran disahkan Lunas!');
  loadBendaharaData();
  loadDashboardData();
};

// Cek Sesi Tersimpan Saat Halaman Dimuat
(async () => {
  const savedId = localStorage.getItem('r3s_session_id');
  if (savedId) {
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', savedId)
      .maybeSingle();
    if (profile) await initSession(profile);
  }
})();