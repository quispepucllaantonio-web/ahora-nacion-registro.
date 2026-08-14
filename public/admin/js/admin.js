document.addEventListener('DOMContentLoaded', () => {
  let authToken = localStorage.getItem('admin_token');
  let allCampaigns = [];

  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');

  initAdmin();

  async function initAdmin() {
    if (authToken) {
      const isValid = await checkAuth();
      if (isValid) {
        showDashboard();
        return;
      }
    }
    showLogin();
  }

  async function checkAuth() {
    try {
      const res = await fetch('/api/admin/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        document.getElementById('user-name-display').textContent = data.user.name || data.user.username;
        return true;
      }
    } catch (e) {}
    localStorage.removeItem('admin_token');
    authToken = null;
    return false;
  }

  function showLogin() {
    loginView.style.display = 'flex';
    dashboardView.style.display = 'none';
  }

  function showDashboard() {
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
    loadDashboardData();
  }

  // Handle Login Form
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Credenciales incorrectas.');
      }

      authToken = data.token;
      localStorage.setItem('admin_token', authToken);
      document.getElementById('user-name-display').textContent = data.user.name || data.user.username;
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.style.display = 'block';
    }
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('admin_token');
    authToken = null;
    showLogin();
  });

  // Tabs Navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

      e.target.classList.add('active');
      const tabId = e.target.dataset.tab;
      document.getElementById(tabId).style.display = 'block';

      if (tabId === 'campaigns-tab') {
        loadCampaignsGrid();
      } else {
        loadRegistrationsTable();
      }
    });
  });

  // Load Dashboard Stats & Data
  async function loadDashboardData() {
    await loadStats();
    await loadFilterDropdowns();
    await loadRegistrationsTable();
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const stats = await res.json();
        document.getElementById('stat-total').textContent = stats.totalRegistrations || 0;
        document.getElementById('stat-today').textContent = stats.todayRegistrations || 0;
        document.getElementById('stat-campaigns').textContent = stats.activeCampaigns || 0;
      }
    } catch (err) {
      console.error('Error cargando stats:', err);
    }
  }

  async function loadFilterDropdowns() {
    try {
      // Cargar campañas
      const resC = await fetch('/api/admin/campaigns', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (resC.ok) {
        allCampaigns = await resC.json();
        const selectC = document.getElementById('filter-campaign');
        selectC.innerHTML = '<option value="">-- Todas las Campañas --</option>';
        allCampaigns.forEach(c => {
          selectC.innerHTML += `<option value="${c.id}">${escapeHtml(c.title)} (${c.category})</option>`;
        });
      }

      // Cargar comunidades
      const resCom = await fetch('/api/admin/communities', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (resCom.ok) {
        const communities = await resCom.json();
        const selectCom = document.getElementById('filter-comunidad');
        selectCom.innerHTML = '<option value="">-- Todas las Comunidades --</option>';
        communities.forEach(com => {
          selectCom.innerHTML += `<option value="${escapeHtml(com)}">${escapeHtml(com)}</option>`;
        });
      }
    } catch (e) {}
  }

  // Load Registrations Table
  let searchTimeout = null;
  const filterInputs = ['filter-search', 'filter-campaign', 'filter-comunidad', 'filter-fecha-inicio', 'filter-fecha-fin'];
  
  filterInputs.forEach(id => {
    const elem = document.getElementById(id);
    if (elem) {
      elem.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(loadRegistrationsTable, 300);
      });
    }
  });

  async function loadRegistrationsTable() {
    const search = document.getElementById('filter-search').value.trim();
    const campaign_id = document.getElementById('filter-campaign').value;
    const comunidad = document.getElementById('filter-comunidad').value;
    const fecha_inicio = document.getElementById('filter-fecha-inicio').value;
    const fecha_fin = document.getElementById('filter-fecha-fin').value;

    const queryParams = new URLSearchParams();
    if (search) queryParams.append('search', search);
    if (campaign_id) queryParams.append('campaign_id', campaign_id);
    if (comunidad) queryParams.append('comunidad', comunidad);
    if (fecha_inicio) queryParams.append('fecha_inicio', fecha_inicio);
    if (fecha_fin) queryParams.append('fecha_fin', fecha_fin);

    try {
      const res = await fetch(`/api/admin/registrations?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (!res.ok) throw new Error('Error al cargar datos');

      const rows = await res.json();
      document.getElementById('count-filtered').textContent = rows.length;

      const tbody = document.getElementById('registrations-tbody');
      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#94a3b8;padding:24px;">No se encontraron registros con los filtros seleccionados.</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(r => `
        <tr>
          <td><b style="font-family:monospace;color:#38bdf8;">${escapeHtml(r.reg_number)}</b></td>
          <td>
            <div style="font-weight:600;color:#fff;">${escapeHtml(r.campaign_title)}</div>
            <span style="font-size:11px;color:#94a3b8;">${escapeHtml(r.campaign_category)}</span>
          </td>
          <td>
            <div style="font-weight:700;color:#f8fafc;">${escapeHtml(r.nombres)} ${escapeHtml(r.apellido_paterno)} ${escapeHtml(r.apellido_materno)}</div>
          </td>
          <td>${r.tiene_dni ? `<span style="font-weight:600;">${escapeHtml(r.dni)}</span>` : '<span style="color:#64748b;">No tiene DNI</span>'}</td>
          <td><a href="tel:${r.celular}" style="color:#10b981;text-decoration:none;font-weight:600;">${escapeHtml(r.celular)}</a></td>
          <td>${escapeHtml(r.comunidad)}</td>
          <td style="font-size:12px;color:#cbd5e1;">${escapeHtml(r.observaciones || '-')}</td>
          <td style="white-space:nowrap;font-size:12px;">
            <div>📅 ${r.fecha_registro}</div>
            <div style="color:#64748b;">🕒 ${r.hora_registro}</div>
          </td>
          <td>
            <span class="badge-status ${r.estado === 'ACTIVO' ? 'badge-active' : 'badge-inactive'}">
              ${r.estado}
            </span>
          </td>
          <td class="no-print">
            <div style="display:flex;gap:6px;">
              <button class="btn-sm btn-edit" onclick="openEditModal(${r.id})">Editar</button>
              <button class="btn-sm ${r.estado === 'ACTIVO' ? 'btn-status-active' : 'btn-status-inactive'}" onclick="toggleStatus(${r.id}, '${r.estado}')">
                ${r.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      // Guardar caché de filas para modal de edición
      window.cachedRegistrations = rows;
    } catch (err) {
      console.error(err);
    }
  }

  // EXPORT EXCEL & CSV
  document.getElementById('btn-export-excel').addEventListener('click', () => {
    const campaign_id = document.getElementById('filter-campaign').value;
    const search = document.getElementById('filter-search').value.trim();
    const comunidad = document.getElementById('filter-comunidad').value;

    const params = new URLSearchParams();
    if (campaign_id) params.append('campaign_id', campaign_id);
    if (search) params.append('search', search);
    if (comunidad) params.append('comunidad', comunidad);

    fetch(`/api/admin/export/excel?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })
    .then(res => res.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Relacion_Inscritos_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  });

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    fetch('/api/admin/export/csv', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })
    .then(res => res.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Inscritos_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  });

  document.getElementById('btn-print').addEventListener('click', () => {
    window.print();
  });

  // Modal handlers
  window.openEditModal = function(id) {
    const reg = (window.cachedRegistrations || []).find(r => r.id === id);
    if (!reg) return;

    document.getElementById('edit-reg-id').value = reg.id;
    document.getElementById('edit-nombres').value = reg.nombres;
    document.getElementById('edit-apellido-paterno').value = reg.apellido_paterno;
    document.getElementById('edit-apellido-materno').value = reg.apellido_materno;
    document.getElementById('edit-tiene-dni').value = reg.tiene_dni ? "1" : "0";
    document.getElementById('edit-dni').value = reg.dni || '';
    document.getElementById('edit-celular').value = reg.celular;
    document.getElementById('edit-comunidad').value = reg.comunidad;
    document.getElementById('edit-observaciones').value = reg.observaciones || '';

    document.getElementById('modal-edit-reg').style.display = 'flex';
  };

  document.getElementById('form-edit-reg').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-reg-id').value;
    const nombres = document.getElementById('edit-nombres').value;
    const apellido_paterno = document.getElementById('edit-apellido-paterno').value;
    const apellido_materno = document.getElementById('edit-apellido-materno').value;
    const tiene_dni = document.getElementById('edit-tiene-dni').value === "1";
    const dni = document.getElementById('edit-dni').value;
    const celular = document.getElementById('edit-celular').value;
    const comunidad = document.getElementById('edit-comunidad').value;
    const observaciones = document.getElementById('edit-observaciones').value;

    try {
      const res = await fetch(`/api/admin/registrations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones
        })
      });
      if (res.ok) {
        closeModal('modal-edit-reg');
        loadRegistrationsTable();
      }
    } catch (err) {}
  });

  window.toggleStatus = async function(id, currentStatus) {
    const newStatus = currentStatus === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    try {
      const res = await fetch(`/api/admin/registrations/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ estado: newStatus })
      });
      if (res.ok) {
        loadRegistrationsTable();
        loadStats();
      }
    } catch (e) {}
  };

  // CAMPAIGNS TAB
  async function loadCampaignsGrid() {
    try {
      const res = await fetch('/api/admin/campaigns', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) return;
      const campaigns = await res.json();
      allCampaigns = campaigns;

      const container = document.getElementById('campaigns-grid');
      const origin = window.location.origin;

      container.innerHTML = campaigns.map(c => {
        const publicUrl = `${origin}/c/${c.slug}`;
        return `
          <div class="campaign-card">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span class="badge-status ${c.is_active ? 'badge-active' : 'badge-inactive'}">${c.is_active ? 'ACTIVA' : 'INACTIVA'}</span>
                <span style="font-size:11px;color:#94a3b8;font-weight:700;">${escapeHtml(c.category)}</span>
              </div>
              <div style="font-size:11px;color:#38bdf8;font-weight:700;margin-bottom:4px;">${escapeHtml(c.header_text || '')}</div>
              <h3>${escapeHtml(c.title)}</h3>
              <p>${escapeHtml(c.description)}</p>
              
              <div class="campaign-link-box">
                🔗 <a href="${publicUrl}" target="_blank" style="color:#38bdf8;text-decoration:none;">${publicUrl}</a>
              </div>

              <div style="font-size:13px;color:#cbd5e1;margin-bottom:12px;">
                👥 Inscritos registrados: <b style="color:#10b981;">${c.total_registros || 0}</b>
              </div>
            </div>

            <div style="display:flex;gap:8px;margin-top:14px;">
              <button class="btn-sm btn-ghost" onclick="copyText('${publicUrl}')">Copiar Link</button>
              <button class="btn-sm btn-edit" onclick="openEditCampaignModal(${c.id})">Editar</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {}
  }

  document.getElementById('btn-open-create-campaign').addEventListener('click', () => {
    document.getElementById('camp-id').value = '';
    document.getElementById('modal-campaign-title').textContent = 'Nueva Campaña de Inscripción';
    document.getElementById('camp-header-text').value = 'AHORA NACIÓN';
    document.getElementById('camp-title').value = 'AHORA NACIÓN — REGISTRO DE PARTICIPANTES';
    document.getElementById('camp-description').value = 'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación. Completa tus datos para registrar tu participación.';
    document.getElementById('camp-category').value = 'Inscripción';
    document.getElementById('camp-share-message').value = '🔴 AHORA NACIÓN — REGISTRO DE PARTICIPANTES\n\n¡Súmate a nuestro movimiento!\nRegistro de personas interesadas en conocer, participar o afiliarse a Ahora Nación.\n\n📱 Completa tus datos aquí:\n\n🔗 [ENLACE]';
    document.getElementById('camp-og-title').value = 'AHORA NACIÓN — Registro de Participantes';
    document.getElementById('camp-og-description').value = 'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación.';
    document.getElementById('camp-og-image').value = '/ahora-nacion-logo.png';

    document.getElementById('modal-campaign').style.display = 'flex';
  });

  window.openEditCampaignModal = function(id) {
    const c = allCampaigns.find(item => item.id === id);
    if (!c) return;

    document.getElementById('camp-id').value = c.id;
    document.getElementById('modal-campaign-title').textContent = 'Editar Campaña';
    document.getElementById('camp-header-text').value = c.header_text || 'AHORA NACIÓN';
    document.getElementById('camp-title').value = c.title;
    document.getElementById('camp-description').value = c.description;
    document.getElementById('camp-category').value = c.category;
    document.getElementById('camp-share-message').value = c.share_message;
    document.getElementById('camp-og-title').value = c.og_title || '';
    document.getElementById('camp-og-description').value = c.og_description || '';
    document.getElementById('camp-og-image').value = c.og_image || '';

    document.getElementById('modal-campaign').style.display = 'flex';
  };

  document.getElementById('form-campaign').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('camp-id').value;
    const header_text = document.getElementById('camp-header-text').value;
    const title = document.getElementById('camp-title').value;
    const description = document.getElementById('camp-description').value;
    const category = document.getElementById('camp-category').value;
    const share_message = document.getElementById('camp-share-message').value;
    const og_title = document.getElementById('camp-og-title').value;
    const og_description = document.getElementById('camp-og-description').value;
    const og_image = document.getElementById('camp-og-image').value;

    const url = id ? `/api/admin/campaigns/${id}` : '/api/admin/campaigns';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          header_text, title, description, category, share_message, og_title, og_description, og_image, is_active: 1
        })
      });

      if (res.ok) {
        closeModal('modal-campaign');
        loadCampaignsGrid();
        loadFilterDropdowns();
      }
    } catch (e) {}
  });

  window.closeModal = function(id) {
    document.getElementById(id).style.display = 'none';
  };

  window.copyText = function(text) {
    navigator.clipboard.writeText(text).then(() => {
      alert('¡Enlace copiado al portapapeles!');
    });
  };

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
