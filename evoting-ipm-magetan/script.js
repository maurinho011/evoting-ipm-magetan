/* =========================================================
   E-VOTING MUSYDA IV PD IPM MAGETAN
   SUPABASE VERSION
========================================================= */

const SUPABASE_URL = "https://wtoshzjcciarihbbxaum.supabase.co";

/*
  Paste your Supabase Publishable Key here.
  Do NOT use the Secret / service_role key.
*/
const SUPABASE_KEY = "sb_publishable_CrZp6BCv0LC8eKuVYmNh9g_SegZuRKR";

if (!window.supabase) {
  alert("Supabase library gagal dimuat. Periksa koneksi internet.");
}

const db = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

let candidates = [];
let tokens = [];
let activeTokenCode = null;
let selectedCandidateIds = [];
let previewPhoto = "";
let currentSession = null;

const pages = {
  peserta: document.getElementById("pesertaPage"),
  adminLogin: document.getElementById("adminLoginPage"),
  admin: document.getElementById("adminPage")
};

function showPage(pageName) {
  Object.values(pages).forEach(page => page.classList.remove("active"));
  pages[pageName].classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function placeholderPhoto(name) {
  const initials = String(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0])
    .join("")
    .toUpperCase();

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="750">
      <rect width="100%" height="100%" fill="#eaf7f3"/>
      <text x="50%" y="50%" dominant-baseline="middle"
        text-anchor="middle" font-family="Arial" font-size="150"
        font-weight="700" fill="#075b54">${escapeHtml(initials)}</text>
    </svg>
  `;

  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function showMessage(id, message, isError = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "var(--danger)" : "var(--green)";
}

async function loadCandidates(activeOnly = true) {
  if (!db) return false;

  let query = db
    .from("candidates")
    .select("id, number, name, photo_url, active, created_at")
    .order("number", { ascending: true });

  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query;

  if (error) {
    console.error(error);
    alert("Gagal memuat data kandidat: " + error.message);
    return false;
  }

  candidates = data || [];
  return true;
}


/* =========================
   PESERTA
========================= */

document.getElementById("openAdminBtn").addEventListener("click", () => {
  document.getElementById("adminEmail").value = "";
  document.getElementById("adminPassword").value = "";
  showMessage("adminLoginMessage", "");
  showPage("adminLogin");
});

document.getElementById("backToPesertaBtn").addEventListener("click", async () => {
  await logoutAdmin(false);
  showPage("peserta");
});

document.getElementById("loginPesertaBtn").addEventListener("click", loginPeserta);

document.getElementById("tokenInput").addEventListener("keydown", event => {
  if (event.key === "Enter") loginPeserta();
});

async function loginPeserta() {
  const input = document.getElementById("tokenInput");
  const code = input.value.trim().toUpperCase();

  showMessage("loginMessage", "");

  if (!code) {
    showMessage("loginMessage", "Masukkan token terlebih dahulu.");
    return;
  }

  if (!db) return;

  const { data, error } = await db.rpc("check_token", {
    p_token_code: code
  });

  if (error) {
    console.error(error);
    showMessage("loginMessage", "Gagal memeriksa token: " + error.message);
    return;
  }

  if (!data?.valid) {
    showMessage(
      "loginMessage",
      data?.message || "Token tidak ditemukan atau sudah digunakan."
    );
    return;
  }

  activeTokenCode = code;
  selectedCandidateIds = [];

  await loadCandidates(true);

  document.getElementById("votingArea").classList.remove("hidden");
  updateSelectedInfo();
  renderCandidates();

  document.getElementById("votingArea").scrollIntoView({
    behavior: "smooth"
  });
}

function renderCandidates() {
  const container = document.getElementById("candidateList");

  if (candidates.length === 0) {
    container.innerHTML = `
      <div class="empty-state">Belum ada calon yang tersedia.</div>
    `;
    return;
  }

  container.innerHTML = candidates
    .sort((a, b) => a.number - b.number)
    .map(candidate => {
      const photo = candidate.photo_url || placeholderPhoto(candidate.name);
      const selected = selectedCandidateIds.includes(candidate.id);

      return `
        <article class="candidate ${selected ? "selected" : ""}" data-id="${candidate.id}">
          <div class="checkmark">${selected ? "✓" : "○"}</div>
          <img class="candidate-photo"
            src="${escapeHtml(photo)}"
            alt="Foto ${escapeHtml(candidate.name)}">
          <div class="candidate-info">
            <div class="candidate-number">NOMOR ${candidate.number}</div>
            <div class="candidate-name">${escapeHtml(candidate.name)}</div>
          </div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll(".candidate").forEach(card => {
    card.addEventListener("click", () => {
      const candidateId = card.dataset.id;
      const alreadySelected = selectedCandidateIds.includes(candidateId);

      if (alreadySelected) {
        selectedCandidateIds = selectedCandidateIds.filter(id => id !== candidateId);
      } else {
        if (selectedCandidateIds.length >= 9) {
          alert(
            "Maksimal 9 calon. Batalkan salah satu pilihan terlebih dahulu jika ingin mengganti calon."
          );
          return;
        }
        selectedCandidateIds.push(candidateId);
      }

      updateSelectedInfo();
      renderCandidates();
    });
  });
}

function updateSelectedInfo() {
  const selectedInfo = document.getElementById("selectedInfo");
  const submitButton = document.getElementById("submitVoteBtn");
  const total = selectedCandidateIds.length;

  submitButton.disabled = total !== 9;

  selectedInfo.textContent =
    total < 9
      ? `Terpilih: ${total} / 9 — pilih ${9 - total} calon lagi.`
      : "Terpilih: 9 / 9 — pilihan sudah lengkap.";
}

document.getElementById("submitVoteBtn").addEventListener("click", submitVote);

async function submitVote() {
  if (!activeTokenCode) return;

  if (selectedCandidateIds.length !== 9) {
    alert("Anda wajib memilih tepat 9 calon.");
    return;
  }

  const selectedCandidates = candidates.filter(candidate =>
    selectedCandidateIds.includes(candidate.id)
  );

  if (selectedCandidates.length !== 9) {
    alert("Pilihan calon tidak valid.");
    return;
  }

  const names = selectedCandidates
    .map(candidate => `• ${candidate.name}`)
    .join("\n");

  if (!confirm(
    `Anda memilih 9 calon berikut:\n\n${names}\n\nApakah pilihan sudah benar?`
  )) return;

  const button = document.getElementById("submitVoteBtn");
  button.disabled = true;
  button.textContent = "Menyimpan...";

  const { data, error } = await db.rpc("submit_vote", {
    p_token_code: activeTokenCode,
    p_candidate_ids: selectedCandidateIds
  });

  button.textContent = "Kirim Suara";

  if (error) {
    console.error(error);
    alert("Suara gagal disimpan: " + error.message);
    updateSelectedInfo();
    return;
  }

  alert(data?.message || "Suara berhasil dicatat. Terima kasih sudah berpartisipasi.");

  activeTokenCode = null;
  selectedCandidateIds = [];
  document.getElementById("tokenInput").value = "";
  document.getElementById("votingArea").classList.add("hidden");
  updateSelectedInfo();
}

document.getElementById("logoutPesertaBtn").addEventListener("click", () => {
  activeTokenCode = null;
  selectedCandidateIds = [];
  document.getElementById("votingArea").classList.add("hidden");
  document.getElementById("tokenInput").value = "";
  updateSelectedInfo();
});


/* =========================
   ADMIN LOGIN
========================= */

document.getElementById("loginAdminBtn").addEventListener("click", loginAdmin);

document.getElementById("adminPassword").addEventListener("keydown", event => {
  if (event.key === "Enter") loginAdmin();
});

document.getElementById("adminEmail").addEventListener("keydown", event => {
  if (event.key === "Enter") loginAdmin();
});

async function loginAdmin() {
  if (!db) return;

  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;

  showMessage("adminLoginMessage", "");

  if (!email || !password) {
    showMessage("adminLoginMessage", "Email dan password wajib diisi.");
    return;
  }

  const button = document.getElementById("loginAdminBtn");
  button.disabled = true;
  button.textContent = "Memeriksa...";

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  button.disabled = false;
  button.textContent = "Login Admin";

  if (error) {
    showMessage("adminLoginMessage", "Login gagal: " + error.message);
    return;
  }

  currentSession = data.session;

  const { data: isAdmin, error: adminError } = await db.rpc("is_admin");

  if (adminError || isAdmin !== true) {
    await db.auth.signOut();
    showMessage("adminLoginMessage", "Akun ini bukan akun admin.");
    return;
  }

  await renderAdmin();
  showPage("admin");
}

document.getElementById("logoutAdminBtn").addEventListener("click", () => {
  logoutAdmin(true);
});

async function logoutAdmin(returnToPeserta = true) {
  if (db) await db.auth.signOut();
  currentSession = null;
  if (returnToPeserta) showPage("peserta");
}


/* =========================
   ADMIN
========================= */

document.getElementById("refreshAdminBtn").addEventListener("click", renderAdmin);

async function renderAdmin() {
  const { data: isAdmin, error } = await db.rpc("is_admin");

  if (error || isAdmin !== true) {
    alert("Sesi admin tidak valid.");
    await logoutAdmin(true);
    return;
  }

  await loadAdminCandidates();
  await loadTokens();
  await renderStatistics();
  await renderResults();

  renderAdminCandidates();
  renderTokens();
}

async function loadAdminCandidates() {
  return loadCandidates(false);
}

async function loadTokens() {
  const { data, error } = await db
    .from("tokens")
    .select("id, code, used, created_at, used_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    alert("Gagal memuat token: " + error.message);
    return false;
  }

  tokens = data || [];
  return true;
}

async function renderStatistics() {
  const [candidatesResult, tokensResult, selectionsResult] =
    await Promise.all([
      db.from("candidates").select("id", { count: "exact", head: true }),
      db.from("tokens").select("id, used"),
      db.from("ballot_selections").select("id", { count: "exact", head: true })
    ]);

  const tokenData = tokensResult.data || [];

  document.getElementById("statCandidates").textContent =
    candidatesResult.count ?? candidates.length;

  document.getElementById("statTokens").textContent =
    tokenData.length;

  document.getElementById("statUsedTokens").textContent =
    tokenData.filter(token => token.used).length;

  document.getElementById("statVotes").textContent =
    selectionsResult.count ?? 0;
}


/* =========================
   PHOTO
========================= */

document.getElementById("candidatePhoto").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("File harus berupa gambar.");
    event.target.value = "";
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    alert("Ukuran foto maksimal 2 MB.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    previewPhoto = reader.result;
    document.getElementById("photoPreview").src = previewPhoto;
    document.getElementById("photoPreviewWrap").classList.remove("hidden");
  };

  reader.readAsDataURL(file);
});

async function uploadCandidatePhoto(file) {
  if (!file) return null;

  const extension = file.name.split(".").pop().toLowerCase();
  const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
  const path = `${crypto.randomUUID()}.${safeExtension}`;

  const { error } = await db.storage
    .from("candidate-photos")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  const { data } = db.storage
    .from("candidate-photos")
    .getPublicUrl(path);

  return data.publicUrl;
}


/* =========================
   CANDIDATE FORM
========================= */

document.getElementById("candidateForm").addEventListener("submit", async event => {
  event.preventDefault();

  const name = document.getElementById("candidateName").value.trim();
  const editingId = document.getElementById("editingCandidateId").value;
  const file = document.getElementById("candidatePhoto").files[0];

  if (!name) {
    alert("Nama calon wajib diisi.");
    return;
  }

  if (!editingId && candidates.length >= 20) {
    alert("Maksimal 20 kandidat.");
    return;
  }

  const saveButton = document.getElementById("saveCandidateBtn");
  saveButton.disabled = true;
  saveButton.textContent = "Menyimpan...";

  try {
    let photoUrl = null;

    if (file) photoUrl = await uploadCandidatePhoto(file);

    if (editingId) {
      const updateData = { name };
      if (photoUrl) updateData.photo_url = photoUrl;

      const { error } = await db
        .from("candidates")
        .update(updateData)
        .eq("id", editingId);

      if (error) throw error;
      alert("Data kandidat berhasil diperbarui.");
    } else {
      const maxNumber = candidates.reduce(
        (max, candidate) => Math.max(max, Number(candidate.number) || 0),
        0
      );

      const { error } = await db
        .from("candidates")
        .insert({
          number: maxNumber + 1,
          name,
          photo_url: photoUrl,
          active: true
        });

      if (error) throw error;
      alert("Kandidat berhasil ditambahkan.");
    }

    resetCandidateForm();
    await renderAdmin();

  } catch (error) {
    alert("Gagal menyimpan kandidat: " + (error?.message || "Terjadi kesalahan."));
  } finally {
    saveButton.disabled = false;
    if (!document.getElementById("editingCandidateId").value) {
      saveButton.textContent = "Tambah Calon";
    }
  }
});

function editCandidate(id) {
  const candidate = candidates.find(item => item.id === id);
  if (!candidate) return;

  document.getElementById("editingCandidateId").value = candidate.id;
  document.getElementById("candidateName").value = candidate.name;

  previewPhoto = candidate.photo_url || "";

  if (previewPhoto) {
    document.getElementById("photoPreview").src = previewPhoto;
    document.getElementById("photoPreviewWrap").classList.remove("hidden");
  }

  document.getElementById("saveCandidateBtn").textContent = "Simpan Perubahan";
  document.getElementById("cancelEditBtn").classList.remove("hidden");

  document.getElementById("candidateForm").scrollIntoView({
    behavior: "smooth"
  });
}

window.editCandidate = editCandidate;

async function deleteCandidate(id) {
  const candidate = candidates.find(item => item.id === id);
  if (!candidate) return;

  if (!confirm(
    `Hapus calon "${candidate.name}"?\n\nJika calon ini sudah memiliki suara, penghapusan akan ditolak agar data suara tetap aman.`
  )) return;

  const { count, error: countError } = await db
    .from("ballot_selections")
    .select("id", { count: "exact", head: true })
    .eq("candidate_id", id);

  if (countError) {
    alert("Gagal memeriksa suara kandidat: " + countError.message);
    return;
  }

  if ((count || 0) > 0) {
    alert("Kandidat ini sudah memiliki suara sehingga tidak dapat dihapus.");
    return;
  }

  const { error } = await db
    .from("candidates")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Gagal menghapus kandidat: " + error.message);
    return;
  }

  await renderAdmin();
}

window.deleteCandidate = deleteCandidate;

document.getElementById("cancelEditBtn").addEventListener("click", resetCandidateForm);

function resetCandidateForm() {
  document.getElementById("candidateForm").reset();
  document.getElementById("editingCandidateId").value = "";
  document.getElementById("saveCandidateBtn").textContent = "Tambah Calon";
  document.getElementById("cancelEditBtn").classList.add("hidden");
  document.getElementById("photoPreviewWrap").classList.add("hidden");
  document.getElementById("photoPreview").removeAttribute("src");
  previewPhoto = "";
}

function renderAdminCandidates() {
  const container = document.getElementById("adminCandidateList");

  if (candidates.length === 0) {
    container.innerHTML = `
      <div class="empty-state">Belum ada calon.</div>
    `;
    return;
  }

  container.innerHTML = [...candidates]
    .sort((a, b) => a.number - b.number)
    .map(candidate => {
      const photo = candidate.photo_url || placeholderPhoto(candidate.name);

      return `
        <div class="admin-candidate">
          <img src="${escapeHtml(photo)}"
            alt="Foto ${escapeHtml(candidate.name)}">

          <div class="admin-candidate-info">
            <strong>
              No. ${candidate.number} — ${escapeHtml(candidate.name)}
            </strong>
            <small>${candidate.active ? "Aktif" : "Nonaktif"}</small>
          </div>

          <div class="admin-candidate-actions">
            <button class="small-btn"
              onclick="editCandidate('${candidate.id}')">
              Edit
            </button>

            <button class="small-btn delete"
              onclick="deleteCandidate('${candidate.id}')">
              Hapus
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}


/* =========================
   TOKENS
========================= */

document.getElementById("generateTokensBtn").addEventListener("click", generateTokens);

async function generateTokens() {
  const amount = Number(document.getElementById("tokenAmount").value);

  if (!amount || amount < 1 || amount > 200) {
    alert("Jumlah token harus antara 1 sampai 200.");
    return;
  }

  const button = document.getElementById("generateTokensBtn");
  button.disabled = true;
  button.textContent = "Generating...";

  try {
    const rows = [];
    const existingCodes = new Set(tokens.map(token => token.code));

    for (let i = 0; i < amount; i++) {
      let code;
      do {
        code = generateRandomToken();
      } while (existingCodes.has(code));

      existingCodes.add(code);
      rows.push({ code });
    }

    const { error } = await db.from("tokens").insert(rows);
    if (error) throw error;

    await renderAdmin();
    alert(`${amount} token berhasil dibuat.`);
  } catch (error) {
    alert("Gagal membuat token: " + (error?.message || "Terjadi kesalahan."));
  } finally {
    button.disabled = false;
    button.textContent = "Generate";
  }
}

function generateRandomToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "IPM-";
  const array = new Uint32Array(6);
  crypto.getRandomValues(array);

  for (let i = 0; i < 6; i++) {
    result += chars[array[i] % chars.length];
  }

  return result;
}

function renderTokens() {
  const container = document.getElementById("tokenList");

  if (tokens.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        Belum ada token. Silakan generate token.
      </div>
    `;
    return;
  }

  container.innerHTML = tokens
    .map(token => `
      <div class="token-item ${token.used ? "used" : ""}">
        <span>${escapeHtml(token.code)}</span>
        <strong>${token.used ? "TERPAKAI" : "AKTIF"}</strong>
      </div>
    `)
    .join("");
}

document.getElementById("exportTokensBtn").addEventListener("click", async () => {
  const activeTokens = tokens
    .filter(token => !token.used)
    .map(token => token.code);

  if (activeTokens.length === 0) {
    alert("Tidak ada token aktif untuk disalin.");
    return;
  }

  try {
    await navigator.clipboard.writeText(activeTokens.join("\n"));
    alert(`${activeTokens.length} token aktif berhasil disalin.`);
  } catch {
    alert("Browser tidak mengizinkan penyalinan otomatis.");
  }
});


/* =========================
   HASIL
========================= */

async function renderResults() {
  const container = document.getElementById("resultList");

  const { data, error } = await db
    .from("ballot_selections")
    .select("candidate_id");

  if (error) {
    container.innerHTML = `
      <div class="empty-state">
        Gagal memuat hasil: ${escapeHtml(error.message)}
      </div>
    `;
    return;
  }

  const counts = {};

  (data || []).forEach(row => {
    counts[row.candidate_id] = (counts[row.candidate_id] || 0) + 1;
  });

  if (candidates.length === 0) {
    container.innerHTML = `
      <div class="empty-state">Belum ada calon.</div>
    `;
    return;
  }

  const totalVotes = Object.values(counts)
    .reduce((sum, value) => sum + value, 0);

  const sorted = [...candidates].sort(
    (a, b) => (counts[b.id] || 0) - (counts[a.id] || 0)
  );

  container.innerHTML = sorted.map(candidate => {
    const votes = counts[candidate.id] || 0;
    const percent = totalVotes === 0 ? 0 : (votes / totalVotes) * 100;

    return `
      <div class="result-item">
        <div class="result-top">
          <span>
            No. ${candidate.number} — ${escapeHtml(candidate.name)}
          </span>
          <span>${votes} suara</span>
        </div>

        <div class="progress">
          <div class="progress-bar" style="width:${percent}%"></div>
        </div>
      </div>
    `;
  }).join("");
}


/* =========================
   RESET
========================= */

document.getElementById("resetVotingBtn").addEventListener("click", resetVoting);

async function resetVoting() {
  if (!confirm("Reset semua status token dan data suara?")) return;

  if (!confirm(
    "Konfirmasi sekali lagi: semua suara akan dihapus dan semua token dikembalikan menjadi AKTIF."
  )) return;

  const { error } = await db.rpc("reset_voting");

  if (error) {
    alert("Reset gagal: " + error.message);
    return;
  }

  await renderAdmin();
  alert("Data voting berhasil direset.");
}


/* =========================
   SHORTCUT + SESSION
========================= */

document.addEventListener("keydown", event => {
  if (
    event.ctrlKey &&
    event.shiftKey &&
    event.key.toLowerCase() === "a"
  ) {
    document.getElementById("adminEmail").value = "";
    document.getElementById("adminPassword").value = "";
    showPage("adminLogin");
  }
});

if (db) {
  db.auth.onAuthStateChange((event, session) => {
    currentSession = session;
  });
}


/* =========================
   START
========================= */

loadCandidates(true).then(() => {
  renderCandidates();
  updateSelectedInfo();
});
