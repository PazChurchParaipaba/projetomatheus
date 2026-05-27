// === MATHEUS SHOWS: LOGIC ===

// --- Supabase Integration ---
const SUPABASE_URL = 'https://groezaseypdbpgymgpvo.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM';

// Inicializar cliente Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let state = {
    shows: [],
    financeiro: []
};

// Sincroniza dados com o Supabase e re-renderiza as telas
async function syncFromSupabase() {
    try {
        const [showsRes, finRes] = await Promise.all([
            supabaseClient.from('shows').select('*').order('data', { ascending: true }),
            supabaseClient.from('financeiro').select('*').order('data', { ascending: false })
        ]);
        
        if (showsRes.error) throw showsRes.error;
        if (finRes.error) throw finRes.error;
        
        state.shows = showsRes.data || [];
        state.financeiro = finRes.data || [];
        
        // Popula select de shows no modal de financeiro
        const showSelect = document.getElementById('fin-show-id');
        if (showSelect) {
            showSelect.innerHTML = '<option value="">Nenhum show vinculado</option>' + 
                state.shows.map(s => `<option value="${s.id}">${formatDateCustom(s.data)} - ${s.local} (${s.cidade})</option>`).join('');
        }

        renderShowsView();
        renderFinanceiroView();
        updateDashboard();
    } catch (err) {
        showToast('Erro ao sincronizar dados: ' + err.message, 'danger');
    }
}

// --- Navegação SPA ---
document.querySelectorAll('.nav-links li').forEach(link => {
    link.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        const target = e.currentTarget.dataset.target;
        e.currentTarget.classList.add('active');
        document.getElementById(target).classList.add('active');
        
        if (target === 'dashboard') updateDashboard();
        if (target === 'shows') renderShowsView();
        if (target === 'financeiro') renderFinanceiroView();
        if (target === 'whatsapp') initBotStatus();
    });
});

// --- Modal Handlers ---
function openModal(modalId, finType = null) {
    if(modalId === 'modal-show') {
        document.getElementById('form-show').reset();
        document.getElementById('show-id').value = '';
        document.querySelector('#modal-show .modal-header h2').innerHTML = '<i class="ph ph-calendar-plus text-gradient"></i> Cadastrar Show';
    }
    
    if(modalId === 'modal-financeiro') {
        document.getElementById('form-financeiro').reset();
        document.getElementById('fin-id').value = '';
    }

    document.getElementById(modalId).classList.add('active');
    
    // Tratamento especial para financeiro (Entrada vs Saida)
    if(modalId === 'modal-financeiro') {
        const title = document.getElementById('modal-fin-title');
        const tipoInput = document.getElementById('fin-tipo-hidden');
        const catSelect = document.getElementById('fin-categoria');
        
        tipoInput.value = finType;
        
        if(finType === 'entrada') {
            title.innerHTML = '<i class="ph ph-trend-up text-gradient"></i> Nova Receita';
            catSelect.innerHTML = `
                <option value="cache">Cachê de Show</option>
                <option value="patrocinio">Patrocínio</option>
                <option value="royalties">Royalties / Direitos</option>
                <option value="outros">Outros</option>
            `;
        } else {
            title.innerHTML = '<i class="ph ph-trend-down text-gradient"></i> Nova Despesa';
            catSelect.innerHTML = `
                <option value="equipe">Pagamento Músicos/Equipe</option>
                <option value="logistica">Logística (Voo, Hotel, Van)</option>
                <option value="marketing">Marketing / Impulsionamento</option>
                <option value="impostos">Impostos / Taxas</option>
                <option value="outros">Outros</option>
            `;
        }
        
        // Popula os shows vinculados
        const showSelect = document.getElementById('fin-show-id');
        showSelect.innerHTML = '<option value="">Nenhum show vinculado</option>' + 
            state.shows.map(s => `<option value="${s.id}">${formatDateCustom(s.data)} - ${s.local} (${s.cidade})</option>`).join('');
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// --- Funções CRUD ---

// Shows
document.getElementById('form-show').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = document.getElementById('show-id').value;
    
    let showObj = {
        data: document.getElementById('show-data').value,
        local: document.getElementById('show-local').value,
        cidade: document.getElementById('show-cidade').value,
        contratante: document.getElementById('show-contratante').value,
        valor: parseFloat(document.getElementById('show-valor').value),
        status: document.getElementById('show-status').value,
        obs: document.getElementById('show-obs').value
    };

    try {
        if (isEdit) {
            const { error } = await supabaseClient.from('shows').update(showObj).eq('id', isEdit);
            if (error) throw error;
            showToast('Show atualizado com sucesso!', 'success');
        } else {
            const { error } = await supabaseClient.from('shows').insert([showObj]);
            if (error) throw error;
            showToast('Show cadastrado com sucesso!', 'success');
        }
        
        closeModal('modal-show');
        e.target.reset();
        await syncFromSupabase();
    } catch (err) {
        showToast('Erro ao salvar show: ' + err.message, 'danger');
    }
});

function editShow(id) {
    const show = state.shows.find(s => s.id === id);
    if(!show) return;
    
    document.getElementById('show-id').value = show.id;
    document.getElementById('show-data').value = show.data;
    document.getElementById('show-local').value = show.local;
    document.getElementById('show-cidade').value = show.cidade;
    document.getElementById('show-contratante').value = show.contratante;
    document.getElementById('show-valor').value = show.valor;
    document.getElementById('show-status').value = show.status;
    document.getElementById('show-obs').value = show.obs;
    
    document.querySelector('#modal-show .modal-header h2').innerHTML = '<i class="ph ph-pencil text-gradient"></i> Editar Show';
    document.getElementById('modal-show').classList.add('active');
}

async function deleteShow(id) {
    if(confirm("Deseja cancelar/excluir este show? Lançamentos financeiros vinculados NÃO serão apagados automaticamente.")) {
        try {
            const { error } = await supabaseClient.from('shows').delete().eq('id', id);
            if (error) throw error;
            showToast('Show excluído da agenda.', 'info');
            await syncFromSupabase();
        } catch (err) {
            showToast('Erro ao excluir show: ' + err.message, 'danger');
        }
    }
}

// Financeiro
document.getElementById('form-financeiro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = document.getElementById('fin-id').value;
    
    const rawDesc = document.getElementById('fin-descricao').value;
    const resp = document.getElementById('fin-responsavel').value;
    const finalDesc = resp ? `[${resp}] ${rawDesc}` : rawDesc;

    let finObj = {
        data: document.getElementById('fin-data').value,
        descricao: finalDesc,
        categoria: document.getElementById('fin-categoria').value,
        tipo: document.getElementById('fin-tipo-hidden').value,
        valor: parseFloat(document.getElementById('fin-valor').value),
        status: document.getElementById('fin-status').value,
        show_id: document.getElementById('fin-show-id').value || null
    };

    try {
        if (isEdit) {
            const { error } = await supabaseClient.from('financeiro').update(finObj).eq('id', isEdit);
            if (error) throw error;
            showToast('Lançamento atualizado!', 'success');
        } else {
            const { error } = await supabaseClient.from('financeiro').insert([finObj]);
            if (error) throw error;
            showToast('Lançamento financeiro salvo!', 'success');
        }
        
        closeModal('modal-financeiro');
        e.target.reset();
        await syncFromSupabase();
    } catch (err) {
        showToast('Erro ao salvar lançamento: ' + err.message, 'danger');
    }
});

function editFin(id) {
    const fin = state.financeiro.find(f => f.id === id);
    if(!fin) return;
    
    openModal('modal-financeiro', fin.tipo);
    document.querySelector('#modal-financeiro .modal-header h2').innerHTML = '<i class="ph ph-pencil text-gradient"></i> Editar Lançamento';
    
    let desc = fin.descricao;
    let resp = '';
    if (desc.startsWith('[Everton] ')) {
        resp = 'Everton';
        desc = desc.replace('[Everton] ', '');
    } else if (desc.startsWith('[Matheus] ')) {
        resp = 'Matheus';
        desc = desc.replace('[Matheus] ', '');
    }

    document.getElementById('fin-id').value = fin.id;
    document.getElementById('fin-data').value = fin.data;
    document.getElementById('fin-descricao').value = desc;
    document.getElementById('fin-responsavel').value = resp;
    document.getElementById('fin-categoria').value = fin.categoria;
    document.getElementById('fin-valor').value = fin.valor;
    document.getElementById('fin-status').value = fin.status;
    document.getElementById('fin-show-id').value = fin.show_id || fin.showId || '';
}

async function deleteFin(id) {
    if(confirm("Excluir lançamento financeiro?")) {
        try {
            const { error } = await supabaseClient.from('financeiro').delete().eq('id', id);
            if (error) throw error;
            showToast('Lançamento financeiro removido.', 'info');
            await syncFromSupabase();
        } catch (err) {
            showToast('Erro ao excluir lançamento: ' + err.message, 'danger');
        }
    }
}

// --- Render Views ---

function renderShowsView() {
    const container = document.getElementById('shows-grid-container');
    
    const searchText = document.getElementById('filter-show-text') ? document.getElementById('filter-show-text').value.toLowerCase() : '';
    const statusFilter = document.getElementById('filter-show-status') ? document.getElementById('filter-show-status').value : 'all';

    let filtrados = [...state.shows];

    if(searchText) {
        filtrados = filtrados.filter(s => s.local.toLowerCase().includes(searchText) || s.cidade.toLowerCase().includes(searchText) || s.contratante.toLowerCase().includes(searchText));
    }
    if(statusFilter !== 'all') {
        filtrados = filtrados.filter(s => s.status === statusFilter);
    }

    if (filtrados.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Nenhum show encontrado.</div>';
        return;
    }

    const sortedShows = filtrados.sort((a, b) => new Date(a.data) - new Date(b.data));

    container.innerHTML = sortedShows.map(show => {
        const dateObj = new Date(show.data);
        const day = dateObj.getDate().toString().padStart(2, '0');
        const month = dateObj.toLocaleString('pt-BR', { month: 'short' });
        
        let statusBadge = '';
        if(show.status === 'confirmado') statusBadge = '<span class="badge badge-success"><i class="ph ph-check"></i> Confirmado</span>';
        else if(show.status === 'orcamento') statusBadge = '<span class="badge badge-warning"><i class="ph ph-clock"></i> Orçamento</span>';
        else if(show.status === 'concluido') statusBadge = '<span class="badge badge-info"><i class="ph ph-flag-checkered"></i> Concluído</span>';
        else statusBadge = '<span class="badge badge-danger"><i class="ph ph-x"></i> Cancelado</span>';

        return `
            <div class="show-card glass-panel">
                <div class="show-card-header">
                    <div class="show-date-box">
                        <span class="month">${month}</span>
                        <span class="day">${day}</span>
                    </div>
                    <div>${statusBadge}</div>
                </div>
                
                <h3 class="show-title">${show.local}</h3>
                
                <div class="show-detail-row">
                    <i class="ph ph-map-pin"></i> ${show.cidade}
                </div>
                <div class="show-detail-row">
                    <i class="ph ph-user"></i> ${show.contratante}
                </div>
                ${show.obs ? `<div class="show-detail-row" style="font-size: 0.8rem; margin-top: 12px; font-style: italic;"><i class="ph ph-info"></i> ${show.obs}</div>` : ''}

                <div class="show-card-footer">
                    <div class="show-value">R$ ${Number(show.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                    <div style="display:flex; gap: 8px;">
                        <button class="btn-icon-primary" style="color: var(--info); background: transparent; border: none; font-size: 1.2rem; cursor: pointer; transition: 0.3s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--info)'" onclick="generatePDF('${show.id}')" title="Gerar Orçamento PDF"><i class="ph ph-file-pdf"></i></button>
                        <button class="btn-icon-primary" style="color: var(--success); background: transparent; border: none; font-size: 1.2rem; cursor: pointer; transition: 0.3s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--success)'" onclick="generateContratoPDF('${show.id}')" title="Gerar Contrato PDF"><i class="ph ph-handshake"></i></button>
                        <button class="btn-icon-primary" style="color: var(--warning); background: transparent; border: none; font-size: 1.2rem; cursor: pointer; transition: 0.3s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--warning)'" onclick="editShow('${show.id}')" title="Editar"><i class="ph ph-pencil"></i></button>
                        <button class="btn-icon-danger" onclick="deleteShow('${show.id}')" title="Excluir"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderFinanceiroView() {
    const tbody = document.getElementById('financeiro-table-body');
    const filtroMes = document.getElementById('filter-mes').value;
    const filtroTipo = document.getElementById('filter-tipo').value;

    let filtrados = [...state.financeiro];
    
    if(filtroTipo !== 'all') {
        filtrados = filtrados.filter(f => f.tipo === filtroTipo);
    }
    
    if(filtroMes !== 'all') {
        filtrados = filtrados.filter(f => {
            const m = new Date(f.data).getMonth().toString();
            return m === filtroMes;
        });
    }

    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum lançamento encontrado.</td></tr>';
        return;
    }

    filtrados.sort((a, b) => new Date(b.data) - new Date(a.data));

    const htmlRows = filtrados.map(item => {
        const showTitle = item.shows ? item.shows.local : '';
        const showLinkName = showTitle ? `<i class="ph ph-calendar-star"></i> ${showTitle}` : '-';
        
        let statusBadge = item.status === 'pago' 
            ? '<span class="badge badge-success">Pago</span>'
            : '<span class="badge badge-warning">Pendente</span>';
            
        let typeBadge = item.tipo === 'entrada'
            ? '<span style="color: var(--success);"><i class="ph ph-arrow-down-left"></i> Entrada</span>'
            : '<span style="color: var(--danger);"><i class="ph ph-arrow-up-right"></i> Saída</span>';

        let desc = item.descricao;
        let resp = '';
        if (desc.startsWith('[Everton] ')) {
            resp = 'Everton';
            desc = desc.replace('[Everton] ', '');
        } else if (desc.startsWith('[Matheus] ')) {
            resp = 'Matheus';
            desc = desc.replace('[Matheus] ', '');
        }

        return `
            <tr>
                <td>${formatDateCustom(item.data)}</td>
                <td>
                    <strong>${desc}</strong><br>
                    <small style="color: var(--text-muted); text-transform: uppercase; font-size: 0.7rem;">${item.categoria}</small>
                    ${resp ? `<br><small style="color: var(--primary); font-size: 0.7rem;"><i class="ph ph-user"></i> <b>${resp}</b></small>` : ''}
                </td>
                <td style="font-size: 0.85rem; color: var(--info);">${showLinkName}</td>
                <td>${typeBadge}</td>
                <td style="font-weight: 600;">R$ ${Number(item.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-icon-primary" style="color: var(--warning); background: transparent; border: none; font-size: 1.2rem; cursor: pointer; transition: 0.3s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--warning)'" onclick="editFin('${item.id}')" title="Editar"><i class="ph ph-pencil"></i></button>
                    <button class="btn-icon-danger" onclick="deleteFin('${item.id}')" title="Excluir"><i class="ph ph-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    const totalEntradas = filtrados.filter(f => f.tipo === 'entrada').reduce((acc, f) => acc + Number(f.valor), 0);
    const totalSaidas = filtrados.filter(f => f.tipo === 'saida').reduce((acc, f) => acc + Number(f.valor), 0);
    const saldo = totalEntradas - totalSaidas;
    const saldoColor = saldo >= 0 ? 'var(--success)' : 'var(--danger)';

    const totalRow = `
        <tr style="background: rgba(0,0,0,0.2); font-weight: bold; border-top: 2px solid rgba(255,255,255,0.1);">
            <td colspan="4" style="text-align: right; color: var(--text-muted);">SALDO DO PERÍODO/FILTRO:</td>
            <td style="color: ${saldoColor}; font-size: 1.1rem;">R$ ${saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
            <td colspan="2">
                <span style="display:block; font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">
                    Entradas: R$ ${totalEntradas.toLocaleString('pt-BR', {minimumFractionDigits: 2})} | Saídas: R$ ${totalSaidas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </span>
            </td>
        </tr>
    `;

    tbody.innerHTML = htmlRows + totalRow;
}

document.getElementById('filter-mes').addEventListener('change', renderFinanceiroView);
document.getElementById('filter-tipo').addEventListener('change', renderFinanceiroView);

if(document.getElementById('filter-show-text')) {
    document.getElementById('filter-show-text').addEventListener('input', renderShowsView);
    document.getElementById('filter-show-status').addEventListener('change', renderShowsView);
}

// --- Dashboard & Gráficos ---

let financeChartInstance = null;

function updateDashboard() {
    // Top KPIs
    const showsFuturos = state.shows.filter(s => new Date(s.data) >= new Date() && s.status !== 'cancelado');
    document.getElementById('dash-shows-count').textContent = showsFuturos.length;
    
    const receitaBruta = state.financeiro.filter(f => f.tipo === 'entrada').reduce((acc, f) => acc + Number(f.valor), 0);
    document.getElementById('dash-revenue').textContent = 'R$ ' + receitaBruta.toLocaleString('pt-BR', {minimumFractionDigits: 2});
    
    const despesas = state.financeiro.filter(f => f.tipo === 'saida').reduce((acc, f) => acc + Number(f.valor), 0);
    document.getElementById('dash-expenses').textContent = 'R$ ' + despesas.toLocaleString('pt-BR', {minimumFractionDigits: 2});

    const lucro = receitaBruta - despesas;
    document.getElementById('dash-profit').textContent = 'R$ ' + lucro.toLocaleString('pt-BR', {minimumFractionDigits: 2});

    // Preview List
    const previewList = document.getElementById('dash-shows-list');
    if (showsFuturos.length === 0) {
        previewList.innerHTML = '<li style="padding: 20px; color: var(--text-muted); text-align:center;">Agenda livre.</li>';
    } else {
        const proximos = showsFuturos.sort((a, b) => new Date(a.data) - new Date(b.data)).slice(0, 4);
        previewList.innerHTML = proximos.map(show => `
            <li>
                <div class="preview-show-info">
                    <strong>${show.local}</strong>
                    <span><i class="ph ph-map-pin"></i> ${show.cidade}</span>
                </div>
                <div class="preview-show-value">
                    <div>R$ ${Number(show.valor).toLocaleString('pt-BR')}</div>
                    <span style="color: var(--primary); font-size: 0.8rem; display:block; text-align:right;">${formatDateCustom(show.data)}</span>
                </div>
            </li>
        `).join('');
    }

    renderChart();
}

function renderChart() {
    const canvas = document.getElementById('financeChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
    let dataEntradas = [0, 0, 0, 0, 0, 0];
    let dataSaidas = [0, 0, 0, 0, 0, 0];

    state.financeiro.forEach(f => {
        const m = new Date(f.data).getMonth();
        if(m < 6) { // Para demo limitamos ao primeiro semestre
            if(f.tipo === 'entrada') dataEntradas[m] += Number(f.valor);
            else dataSaidas[m] += Number(f.valor);
        }
    });

    if (financeChartInstance) {
        financeChartInstance.destroy();
    }

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    financeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Receitas',
                    data: dataEntradas,
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'Despesas',
                    data: dataSaidas,
                    backgroundColor: 'rgba(244, 63, 94, 0.8)',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    beginAtZero: true
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true } }
            }
        }
    });
}

// --- Utils ---
function formatDateCustom(dateStr) {
    if(!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if(parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ph-check-circle';
    if(type === 'danger') icon = 'ph-warning-circle';
    if(type === 'warning') icon = 'ph-warning';
    if(type === 'info') icon = 'ph-info';
    
    toast.innerHTML = `<i class="ph ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function generatePDF(id) {
    const show = state.shows.find(s => s.id === id);
    if (!show) return;

    // Preenche o template
    document.getElementById('pdf-contratante').innerText = show.contratante || '-';
    document.getElementById('pdf-local').innerText = show.local || '-';
    document.getElementById('pdf-cidade').innerText = show.cidade || '-';
    document.getElementById('pdf-data').innerText = formatDateCustom(show.data) + (show.data.includes('T') ? ' às ' + show.data.split('T')[1] : '');
    document.getElementById('pdf-valor').innerText = Number(show.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2});
    
    if(show.obs) {
        document.getElementById('pdf-obs-section').style.display = 'block';
        document.getElementById('pdf-obs').innerText = show.obs;
    } else {
        document.getElementById('pdf-obs-section').style.display = 'none';
    }

    const element = document.getElementById('pdf-template');
    const appContainer = document.querySelector('.app-container');
    const bgEffects = document.querySelector('.background-effects');
    
    // Hide App, Show PDF
    if(appContainer) appContainer.style.display = 'none';
    if(bgEffects) bgEffects.style.display = 'none';
    element.style.display = 'block';
    
    window.scrollTo(0,0);
    
    const opt = {
        margin:       0,
        filename:     `Orcamento_Matheus_Oliveira_${show.cidade.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 1.0 },
        html2canvas:  { scale: 2, useCORS: true, scrollY: 0 },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    showToast('Gerando PDF... Aguarde.', 'info');
    
    html2pdf().set(opt).from(element).save().then(() => {
        showToast('PDF gerado com sucesso!', 'success');
        if(appContainer) appContainer.style.display = 'flex';
        if(bgEffects) bgEffects.style.display = 'block';
        element.style.display = 'none';
    }).catch(err => {
        console.error(err);
        showToast('Erro ao gerar o PDF.', 'danger');
        if(appContainer) appContainer.style.display = 'flex';
        if(bgEffects) bgEffects.style.display = 'block';
        element.style.display = 'none';
    });
}

function generateContratoPDF(id) {
    const show = state.shows.find(s => s.id === id);
    if (!show) return;

    // Preenche o template de Contrato
    document.getElementById('contrato-contratante').innerText = show.contratante || '-';
    document.getElementById('contrato-assinatura-contratante').innerText = show.contratante || '-';
    document.getElementById('contrato-local').innerText = show.local || '-';
    document.getElementById('contrato-cidade').innerText = show.cidade || '-';
    document.getElementById('contrato-data').innerText = formatDateCustom(show.data) + (show.data.includes('T') ? ' às ' + show.data.split('T')[1] : '');
    document.getElementById('contrato-valor').innerText = Number(show.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2});
    
    if(show.obs) {
        document.getElementById('contrato-obs-section').style.display = 'block';
        document.getElementById('contrato-obs').innerText = show.obs;
    } else {
        document.getElementById('contrato-obs-section').style.display = 'none';
    }

    const element = document.getElementById('pdf-contrato-template');
    const appContainer = document.querySelector('.app-container');
    const bgEffects = document.querySelector('.background-effects');
    
    // Hide App, Show PDF
    if(appContainer) appContainer.style.display = 'none';
    if(bgEffects) bgEffects.style.display = 'none';
    element.style.display = 'block';
    
    window.scrollTo(0,0);
    
    const opt = {
        margin:       0,
        filename:     `Contrato_Matheus_Oliveira_${show.cidade.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 1.0 },
        html2canvas:  { scale: 2, useCORS: true, scrollY: 0 },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    showToast('Gerando Contrato PDF...', 'info');
    
    html2pdf().set(opt).from(element).save().then(() => {
        showToast('Contrato gerado com sucesso!', 'success');
        if(appContainer) appContainer.style.display = 'flex';
        if(bgEffects) bgEffects.style.display = 'block';
        element.style.display = 'none';
    }).catch(err => {
        console.error(err);
        showToast('Erro ao gerar o Contrato.', 'danger');
        if(appContainer) appContainer.style.display = 'flex';
        if(bgEffects) bgEffects.style.display = 'block';
        element.style.display = 'none';
    });
}

function exportToCSV(type) {
    let dataToExport = [];
    let headers = [];
    let filename = '';

    if (type === 'shows') {
        filename = 'Agenda_Shows.csv';
        headers = ['Data e Hora', 'Local', 'Cidade', 'Contratante', 'Valor Bruto', 'Status', 'Observacoes'];
        dataToExport = state.shows.map(s => [
            s.data.replace('T', ' '), s.local, s.cidade, s.contratante, s.valor, s.status, s.obs || ''
        ]);
    } else if (type === 'financeiro') {
        filename = 'Controle_Financeiro.csv';
        headers = ['Data', 'Descricao', 'Categoria', 'Tipo', 'Valor', 'Status', 'Show ID Vinculado'];
        dataToExport = state.financeiro.map(f => [
            f.data, f.descricao, f.categoria, f.tipo, f.valor, f.status, f.show_id || f.showId || ''
        ]);
    }

    if(dataToExport.length === 0) {
        showToast('Nenhum dado para exportar.', 'warning');
        return;
    }

    const processRow = row => row.map(val => {
        let str = String(val || '').replace(/"/g, '""');
        if (str.search(/("|,|\n)/g) >= 0) {
            str = `"${str}"`;
        }
        return str;
    }).join(',');

    let csvContent = processRow(headers) + '\n' + dataToExport.map(processRow).join('\n');
    
    // Adicionar BOM para acentos abrirem corretamente no Excel no Windows
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Planilha exportada com sucesso!', 'success');
}

// --- Auth Logic ---

function checkSession() {
    const sessionUserStr = localStorage.getItem('app_user');
    
    if (sessionUserStr) {
        try {
            const sessionUser = JSON.parse(sessionUserStr);
            let userName = sessionUser.nome || sessionUser.name || sessionUser.email.split('@')[0];
            let userRole = sessionUser.role || sessionUser.perfil || 'Usuário';

            // Garante que o Erick seja reconhecido como Admin com o nome correto
            if (sessionUser.email && sessionUser.email.toLowerCase().includes('erickbarroso')) {
                userName = 'Erick Barroso';
                userRole = 'Administrador';
            }

            const initials = userName.substring(0, 2).toUpperCase();
            
            document.getElementById('sidebar-user-name').textContent = userName;
            document.getElementById('sidebar-user-avatar').textContent = initials;
            document.getElementById('sidebar-user-role').textContent = userRole;
            
        } catch (e) {
            console.error("Erro ao ler usuário da sessão", e);
        }

        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        syncFromSupabase();
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login');
    
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Entrando...';
    btn.disabled = true;

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('email', email)
            .eq('password', password);

        if (error) throw error;

        if (data && data.length > 0) {
            localStorage.setItem('app_user', JSON.stringify(data[0]));
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            checkSession();
            showToast('Login realizado com sucesso!', 'success');
        } else {
            showToast('Erro ao fazer login: Credenciais inválidas.', 'danger');
        }
    } catch (err) {
        showToast('Erro ao conectar: ' + err.message, 'danger');
    } finally {
        btn.innerHTML = 'Entrar no Sistema';
        btn.disabled = false;
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('app_user');
    checkSession();
    showToast('Logout realizado.', 'info');
});

// Inicialização
function initApp() {
    checkSession();
}

// --- WhatsApp Bot Logic ---
let botStatusInterval = null;
const BOT_API_URL = ''; // Relative path for production

async function checkBotStatus() {
    try {
        const res = await fetch(`${BOT_API_URL}/api/whatsapp-status`);
        if (!res.ok) return;
        
        const data = await res.json();
        
        if (data.connected) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('connectedSection').style.display = 'block';
        } else {
            document.getElementById('loginSection').style.display = 'block';
            document.getElementById('connectedSection').style.display = 'none';
            
            if (data.hasQr && data.qr) {
                document.getElementById('qrImg').src = data.qr;
                document.getElementById('qrPlaceholder').style.display = 'none';
                document.getElementById('qrContainer').style.display = 'block';
                document.getElementById('statusText').innerText = 'Escaneie agora!';
            }
        }
    } catch (e) {
        console.warn('Erro ao conectar com a API do Bot. O bot está rodando?', e);
    }
}

function initBotStatus() {
    checkBotStatus();
    if (botStatusInterval) clearInterval(botStatusInterval);
    botStatusInterval = setInterval(checkBotStatus, 3000);
}

async function limparSessaoBot() {
    try {
        showToast('Reiniciando conexão com o Bot...', 'info');
        const res = await fetch(`${BOT_API_URL}/api/clear-session`, {
            method: 'POST',
            // Temporariamente burlando auth ou enviando o básico se o bot exigir
            headers: { 'Authorization': 'Bearer igreja_super_secreta_123' }
        });
        
        if (res.ok) {
            document.getElementById('loginSection').style.display = 'block';
            document.getElementById('connectedSection').style.display = 'none';
            document.getElementById('qrPlaceholder').style.display = 'inline-block';
            document.getElementById('qrContainer').style.display = 'none';
            document.getElementById('statusText').innerText = 'Aguardando novo código...';
            showToast('Sessão limpa, aguarde o novo QR Code.', 'success');
        }
    } catch (e) {
        showToast('Erro ao tentar reiniciar o bot.', 'danger');
    }
}

initApp();
