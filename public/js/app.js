document.addEventListener('DOMContentLoaded', () => {
  const appContainer = document.getElementById('app');
  const slug = appContainer.dataset.slug || getSlugFromUrl() || 'campana-general';
  
  let currentCampaign = null;

  initApp();

  function getSlugFromUrl() {
    const path = window.location.pathname;
    if (path.startsWith('/c/')) {
      return path.replace('/c/', '').trim();
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('camp') || params.get('c');
  }

  async function initApp() {
    try {
      const res = await fetch(`/api/public/campaign/${slug}`);
      if (!res.ok) {
        throw new Error('Campaña no disponible');
      }
      currentCampaign = await res.json();
      renderFormView(currentCampaign);
    } catch (err) {
      renderErrorView('No se pudo cargar la campaña de inscripción. Verifica el enlace.');
    }
  }

  function renderFormView(campaign) {
    const bannerHtml = campaign.og_image ? `<img src="${campaign.og_image}" alt="Banner" class="logo-banner" />` : '';

    appContainer.innerHTML = `
      <div class="container">
        <div class="glass-card">
          <div class="header-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>${escapeHtml(campaign.header_text || 'AHORA NACIÓN')}</span>
          </div>

          ${bannerHtml}

          <h1 class="title-header">${escapeHtml(campaign.title)}</h1>
          <p class="subtitle">${escapeHtml(campaign.description || 'Completa tus datos para registrarte.')}</p>

          <div id="alert-msg" class="alert-box alert-error"></div>

          <form id="registration-form" novalidate>
            <div class="form-group">
              <label class="form-label">Nombres <span class="req">*</span></label>
              <input type="text" id="nombres" class="input-control" placeholder="Ej. Juan Carlos" required autocomplete="given-name">
            </div>

            <div class="form-group">
              <label class="form-label">Apellido Paterno <span class="req">*</span></label>
              <input type="text" id="apellido_paterno" class="input-control" placeholder="Ej. Pérez" required autocomplete="family-name">
            </div>

            <div class="form-group">
              <label class="form-label">Apellido Materno <span class="req">*</span></label>
              <input type="text" id="apellido_materno" class="input-control" placeholder="Ej. Quispe" required autocomplete="additional-name">
            </div>

            <div class="form-group">
              <label class="form-label">¿Tiene DNI? <span class="req">*</span></label>
              <div class="radio-toggle-group">
                <label class="radio-option">
                  <input type="radio" name="tiene_dni" value="1" checked>
                  <div class="radio-tile">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                    <span>Sí</span>
                  </div>
                </label>
                <label class="radio-option">
                  <input type="radio" name="tiene_dni" value="0">
                  <div class="radio-tile">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    <span>No</span>
                  </div>
                </label>
              </div>
            </div>

            <div id="dni-container" class="form-group dni-container">
              <label class="form-label">Número de DNI <span class="req">*</span></label>
              <input type="text" id="dni" class="input-control" placeholder="Ingrese los 8 dígitos del DNI" maxlength="8" pattern="[0-9]*" inputmode="numeric">
            </div>

            <div class="form-group">
              <label class="form-label">Número de celular <span class="req">*</span></label>
              <input type="tel" id="celular" class="input-control" placeholder="Ej. 987654321" required inputmode="tel" maxlength="15">
            </div>

            <div class="form-group">
              <label class="form-label">Comunidad / Localidad <span class="req">*</span></label>
              <input type="text" id="comunidad" class="input-control" placeholder="Ej. Comunidad Nativa San José" required>
            </div>

            <div class="form-group">
              <label class="form-label">Observaciones <span style="color:#64748b;font-weight:normal">(Opcional)</span></label>
              <textarea id="observaciones" class="textarea-control" rows="2" placeholder="Agregue alguna información relevante..."></textarea>
            </div>

            <button type="submit" id="btn-submit" class="btn-primary">
              <span>REGISTRARME</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </form>
        </div>

        <div class="footer-admin-link">
          <a href="/admin/index.html" target="_blank">⚙ Acceso Administrativo</a>
        </div>
      </div>
      <div id="toast" class="toast"></div>
    `;

    setupFormLogic();
  }

  function setupFormLogic() {
    const form = document.getElementById('registration-form');
    const radioTieneDni = document.querySelectorAll('input[name="tiene_dni"]');
    const dniContainer = document.getElementById('dni-container');
    const dniInput = document.getElementById('dni');
    const alertBox = document.getElementById('alert-msg');
    const btnSubmit = document.getElementById('btn-submit');

    // Toggle DNI input
    radioTieneDni.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.value === '1') {
          dniContainer.classList.remove('hidden');
          dniInput.required = true;
        } else {
          dniContainer.classList.add('hidden');
          dniInput.required = false;
          dniInput.value = '';
        }
      });
    });

    // Solo números en DNI
    dniInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.style.display = 'none';

      const tieneDniVal = document.querySelector('input[name="tiene_dni"]:checked').value === '1';
      const nombres = document.getElementById('nombres').value.trim();
      const apellido_paterno = document.getElementById('apellido_paterno').value.trim();
      const apellido_materno = document.getElementById('apellido_materno').value.trim();
      const dni = dniInput.value.trim();
      const celular = document.getElementById('celular').value.trim();
      const comunidad = document.getElementById('comunidad').value.trim();
      const observaciones = document.getElementById('observaciones').value.trim();

      // Validaciones Frontend
      if (!nombres || !apellido_paterno || !apellido_materno || !celular || !comunidad) {
        showAlert('Por favor, completa todos los campos obligatorios (*).');
        return;
      }

      if (tieneDniVal) {
        if (!dni || dni.length !== 8) {
          showAlert('El número de DNI debe contener exactamente 8 dígitos.');
          return;
        }
      }

      if (celular.length < 9) {
        showAlert('Ingrese un número de celular válido de al menos 9 dígitos.');
        return;
      }

      // Deshabilitar botón durante el envio
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span>Procesando...</span>';

      try {
        const res = await fetch('/api/public/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: currentCampaign.id,
            nombres,
            apellido_paterno,
            apellido_materno,
            tiene_dni: tieneDniVal,
            dni,
            celular,
            comunidad,
            observaciones
          })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Ocurrió un error al guardar el registro.');
        }

        renderSuccessView(data);
      } catch (err) {
        showAlert(err.message);
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span>REGISTRARME</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
      }
    });
  }

  function renderSuccessView(result) {
    const currentUrl = window.location.href;
    
    // Construir mensaje predeterminado de difusión
    let shareTextTemplate = currentCampaign.share_message || `📢 REGISTRO DE PARTICIPANTES\n\n¡Regístrate aquí!\nCompleta tus datos en nuestro formulario de inscripción.\n\n📱 Registro rápido y sencillo.\n\n🔗 [ENLACE]`;
    
    // Reemplazar [ENLACE] si existe en la plantilla
    if (shareTextTemplate.includes('[ENLACE]')) {
      shareTextTemplate = shareTextTemplate.replace('[ENLACE]', currentUrl);
    } else {
      shareTextTemplate += `\n\n🔗 ${currentUrl}`;
    }

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareTextTemplate)}`;
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`;

    appContainer.innerHTML = `
      <div class="container">
        <div class="glass-card success-card">
          <div class="success-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
          </div>

          <h2 style="font-size:22px;font-weight:800;color:#fff;margin-bottom:6px;">¡Registro realizado correctamente!</h2>
          <p style="font-size:14px;color:#94a3b8;">Gracias por registrarte en nuestro sistema.</p>

          <div class="reg-code-box">
            <div class="reg-code-label">NÚMERO DE INSCRIPCIÓN</div>
            <div class="reg-code-val">${escapeHtml(result.reg_number)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">Fecha: ${result.fecha_registro} | Hora: ${result.hora_registro}</div>
          </div>

          <div class="share-section">
            <div class="share-title">COMPARTIR INSCRIPCIÓN</div>
            <p style="font-size:12px;color:#94a3b8;margin-bottom:14px;">Ayúdanos compartiendo este enlace con otros participantes por WhatsApp o Facebook:</p>
            
            <div class="share-buttons">
              <a href="${waUrl}" target="_blank" class="btn-share-wa">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-1.157 4.228 4.301-1.127z"/></svg>
                <span>Compartir por WhatsApp</span>
              </a>

              <a href="${fbUrl}" target="_blank" class="btn-share-fb">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                <span>Compartir en Facebook</span>
              </a>

              <button type="button" id="btn-copy-link" class="btn-share-copy">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                <span>Copiar Enlace de Registro</span>
              </button>
            </div>
          </div>

          <button type="button" onclick="location.reload()" class="btn-primary" style="margin-top:24px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);">
            <span>Realizar otra inscripción</span>
          </button>
        </div>
      </div>
      <div id="toast" class="toast"></div>
    `;

    document.getElementById('btn-copy-link').addEventListener('click', () => {
      navigator.clipboard.writeText(currentUrl).then(() => {
        showToast('¡Enlace copiado al portapapeles!');
      }).catch(() => {
        showToast('No se pudo copiar automáticamente.');
      });
    });
  }

  function showAlert(msg) {
    const alertBox = document.getElementById('alert-msg');
    if (alertBox) {
      alertBox.textContent = msg;
      alertBox.style.display = 'block';
    }
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }
  }

  function renderErrorView(msg) {
    appContainer.innerHTML = `
      <div class="container">
        <div class="glass-card" style="text-align:center;">
          <h2 style="color:#ef4444;margin-bottom:10px;">Enlace no válido</h2>
          <p style="color:#94a3b8;font-size:14px;">${escapeHtml(msg)}</p>
        </div>
      </div>
    `;
  }

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
