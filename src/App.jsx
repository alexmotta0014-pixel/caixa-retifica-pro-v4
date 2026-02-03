import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Trash2, Save, Search, BarChart2, AlertTriangle, 
  CheckCircle, Edit, Database, Loader2, MinusCircle, 
  Calendar, CreditCard, DollarSign, Settings, FileText, Car, Bug, Download, Clock, X, ChevronDown, ChevronUp, Filter, LayoutDashboard, PieChart, TrendingUp, Upload, FileJson
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, writeBatch } from 'firebase/firestore';

// ------------------------------------------------------------------
// ✅ CHAVE CONFIGURADA
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDljmh5wiYtFOQtPwcO5Wyfwg3NVJrjOYc",
  authDomain: "retifica-caixa.firebaseapp.com",
  projectId: "retifica-caixa",
  storageBucket: "retifica-caixa.firebasestorage.app",
  messagingSenderId: "520983797933",
  appId: "1:520983797933:web:0e886653472bec6cd6e624"
};
// ------------------------------------------------------------------

// ⚠️ NOVA GAVETA DE DADOS: Começa zerada, sem misturar com a versão 3.0
const COLLECTION_NAME = 'lancamentos_v4'; 

const SERVICOS_PADRAO = ["GERAL CABEÇOTES", "FACE", "SOLDA", "EIXO", "BLOCO", "ENCHIMENTO", "BRUNIMENTO", "MONTAGEM", "VENDA BIELA", "MATERIAL", "JATO DE AREIA", "ROSCA POSTIÇA", "OUTROS"];
const MAQUINAS_CARTAO = ["Cielo", "Rede", "Getnet", "Stone", "PagSeguro", "SumUp", "C6", "InfinitePay", "Mercado Pago"];
const SENHA_MESTRA = "alex";

// --- UTILITÁRIOS ---
const safeMath = (val) => Math.round((val + Number.EPSILON) * 100) / 100;
const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
const formatDate = (d) => { if (!d) return '-'; const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };

const InputMoney = ({ value, onChange, name, className, bg = "bg-white" }) => {
  const handleChange = (e) => onChange({ target: { name, value: (Number(e.target.value.replace(/\D/g, '')) / 100).toFixed(2) } });
  return (
    <div className={`relative rounded border border-gray-200 ${bg} flex items-center overflow-hidden focus-within:ring-2 focus-within:ring-blue-500`}>
      <span className="pl-3 text-xs font-bold text-gray-500">R$</span>
      <input type="text" inputMode="numeric" name={name} value={value ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(value) : ''} onChange={handleChange} placeholder="0,00" className={`w-full p-2 outline-none text-right font-medium text-gray-700 bg-transparent ${className}`}/>
    </div>
  );
};

// --- GRÁFICOS VISUAIS (CSS PURO) ---
const SimpleBarChart = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end justify-between h-40 gap-1 pt-6 px-2 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1 group relative min-w-[20px]">
          <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-slate-800 text-white px-2 py-1 rounded whitespace-nowrap z-10 shadow-lg font-bold">{formatCurrency(d.value)}</div>
          <div 
            className="w-full bg-indigo-500 rounded-t hover:bg-indigo-600 transition-all cursor-pointer relative" 
            style={{ height: `${Math.max((d.value / maxVal) * 100, 2)}%` }} 
          ></div>
          <span className="text-[9px] text-gray-500 mt-1 rotate-0 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

const SimplePieChart = ({ data }) => {
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];
  const total = data.reduce((acc, curr) => acc + curr.value, 0);
  let cumulativePercent = 0;
  
  const gradient = data.map((d, i) => {
    const percent = (d.value / total) * 100;
    const start = cumulativePercent;
    cumulativePercent += percent;
    return `${colors[i % colors.length]} ${start}% ${cumulativePercent}%`;
  }).join(', ');

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 justify-center">
      <div 
        className="w-32 h-32 rounded-full shadow-lg relative flex-shrink-0 border-4 border-white"
        style={{ background: `conic-gradient(${gradient || '#e2e8f0 0% 100%'})` }}
      >
        <div className="absolute inset-8 bg-white rounded-full flex items-center justify-center shadow-inner">
           <div className="text-center">
             <span className="text-[9px] text-gray-400 font-bold block">TOTAL</span>
             <span className="text-[10px] font-bold text-gray-800">100%</span>
           </div>
        </div>
      </div>
      <div className="flex-1 text-xs space-y-2 w-full max-w-xs">
        {data.map((d, i) => (
          <div key={i} className="flex justify-between items-center bg-gray-50 p-1.5 rounded border border-gray-100">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{background: colors[i % colors.length]}}></span>
              <span className="truncate font-medium text-gray-700" title={d.label}>{d.label}</span>
            </div>
            <span className="font-bold text-gray-900">{Math.round((d.value/total)*100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [lancamentos, setLancamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notif, setNotif] = useState(null);
  
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0, 7));
  const [buscaTexto, setBuscaTexto] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [analiseInicio, setAnaliseInicio] = useState(new Date().toISOString().slice(0, 8) + '01');
  const [analiseFim, setAnaliseFim] = useState(new Date().toISOString().slice(0, 10));

  const [formData, setFormData] = useState({ data: new Date().toISOString().slice(0, 10), nota: '', cliente: '', carro: '', modelo: '', servicos: [{ nome: SERVICOS_PADRAO[0], valor: 0, customName: '' }], pagamentos: { pix: 0, dinheiro: 0, debito: 0, credito: 0 }, cartaoDetalhes: { maquina: '', parcelas: '' }, quitacao: '' });
  const [isEditing, setIsEditing] = useState(null);
  
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showDashboardModal, setShowDashboardModal] = useState(false);
  const [showServiceDetails, setShowServiceDetails] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  const [deletePassword, setDeletePassword] = useState('');
  const [configError, setConfigError] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  
  const fileInputRef = useRef(null);

  const { app, auth, db } = useMemo(() => {
    try {
      const appInstance = initializeApp(firebaseConfig);
      return { app: appInstance, auth: getAuth(appInstance), db: getFirestore(appInstance) };
    } catch (e) {
      console.error("Erro config:", e);
      setConfigError(true);
      return { app: null, auth: null, db: null };
    }
  }, []);

  useEffect(() => { 
    if (!auth) return;
    signInAnonymously(auth).catch(e => { console.error("Erro Auth:", e); notify("Erro Autenticação: " + e.message, "error"); }); 
    return onAuthStateChanged(auth, setUser); 
  }, [auth]);

  useEffect(() => {
    if (!user || !db) return;
    return onSnapshot(collection(db, COLLECTION_NAME), (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => {
        const dateDiff = new Date(b.data) - new Date(a.data);
        if (dateDiff !== 0) return dateDiff;
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return createdB - createdA;
      });
      setLancamentos(data);
      setLoading(false);
    }, (error) => { console.error("Erro Snapshot:", error); notify("Erro Leitura: " + error.message, "error"); });
  }, [user, db]);

  const totalServico = useMemo(() => safeMath(formData.servicos.reduce((acc, c) => acc + Number(c.valor), 0)), [formData.servicos]);
  const totalPago = useMemo(() => safeMath(Number(formData.pagamentos.pix) + Number(formData.pagamentos.dinheiro) + Number(formData.pagamentos.debito) + Number(formData.pagamentos.credito)), [formData.pagamentos]);

  useEffect(() => { if (safeMath(totalPago - totalServico) >= -0.01 && totalServico > 0 && !formData.quitacao) setFormData(p => ({ ...p, quitacao: new Date().toISOString().slice(0, 10) })); }, [totalPago, totalServico]);

  const handleInputChange = (e, sec) => {
    const { name, value } = e.target;
    if (sec === 'pagamentos') setFormData(p => ({ ...p, pagamentos: { ...p.pagamentos, [name]: value } }));
    else if (sec === 'cartao') setFormData(p => ({ ...p, cartaoDetalhes: { ...p.cartaoDetalhes, [name]: value } }));
    else setFormData(p => ({ ...p, [name]: ['cliente', 'carro', 'modelo'].includes(name) ? value.toUpperCase() : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return notify("Erro: Aguarde conectar ao Google.", "error");
    if (!formData.cliente) return notify("Preencha o cliente", "error");
    
    const pl = { ...formData, total: totalServico, totalPago, saldo: safeMath(totalPago - totalServico), status: safeMath(totalPago - totalServico) >= 0 ? (safeMath(totalPago - totalServico) > 0 ? 'credito' : 'pago') : 'pendente', updatedAt: new Date().toISOString() };
    
    try {
      if (isEditing) { await updateDoc(doc(db, COLLECTION_NAME, isEditing), pl); notify("Atualizado!"); }
      else { await addDoc(collection(db, COLLECTION_NAME), { ...pl, createdAt: new Date().toISOString() }); notify("Salvo!"); }
      setFormData({ data: new Date().toISOString().slice(0, 10), nota: '', cliente: '', carro: '', modelo: '', servicos: [{ nome: SERVICOS_PADRAO[0], valor: 0, customName: '' }], pagamentos: { pix: 0, dinheiro: 0, debito: 0, credito: 0 }, cartaoDetalhes: { maquina: '', parcelas: '' }, quitacao: '' }); setIsEditing(null);
    } catch (e) { console.error(e); notify("Erro ao salvar: " + e.message, "error"); }
  };

  const notify = (msg, type) => { setNotif({ msg, type }); setTimeout(() => setNotif(null), 5000); };
  const requestDelete = (item) => { setItemToDelete(item); };
  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try { await deleteDoc(doc(db, COLLECTION_NAME, itemToDelete.id)); notify("Item apagado!", "success"); setItemToDelete(null); } 
    catch (e) { console.error(e); notify("Erro ao apagar: " + e.message, "error"); }
  };

  // ADMIN
  const executeBatchDelete = async (itemsToDelete) => {
    if (deletePassword !== SENHA_MESTRA) return notify("Senha Incorreta", "error");
    try {
      const batchSize = 300; 
      for (let i = 0; i < itemsToDelete.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = itemsToDelete.slice(i, i + batchSize);
        chunk.forEach(docData => { batch.delete(doc(db, COLLECTION_NAME, docData.id)); });
        await batch.commit();
      }
      notify(`Sucesso! ${itemsToDelete.length} registros apagados.`, "success"); setShowDeleteModal(false); setDeletePassword('');
    } catch (e) { notify("Erro ao limpar: " + e.message, "error"); }
  };
  const handleDeleteOld = () => {
    const date = new Date(); date.setMonth(date.getMonth() - 3); const cutoffDate = date.toISOString().split('T')[0]; 
    const oldItems = lancamentos.filter(item => item.data < cutoffDate && item.status !== 'pendente');
    if (oldItems.length === 0) return notify("Nada antigo e pago para limpar.");
    if (confirm(`Apagar ${oldItems.length} registros FINALIZADOS anteriores a ${formatDate(cutoffDate)}?`)) executeBatchDelete(oldItems);
  };
  const handleDeleteAll = () => { if (confirm("TEM CERTEZA? Isso apaga TUDO.")) executeBatchDelete(lancamentos); };

  // BACKUP & RESTORE
  const handleBackup = () => {
    const dataStr = JSON.stringify(lancamentos, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Backup_Caixa4_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    notify("Backup baixado com sucesso!", "success");
  };

  const handleRestore = (e) => {
    if (deletePassword !== SENHA_MESTRA) return notify("Senha Incorreta para Restaurar", "error");
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (!Array.isArray(data)) throw new Error("Arquivo inválido");
            if (!confirm(`Importar ${data.length} registros? Isso vai somar aos atuais.`)) return;
            const batchSize = 300;
            for (let i = 0; i < data.length; i += batchSize) {
                const batch = writeBatch(db);
                const chunk = data.slice(i, i + batchSize);
                chunk.forEach(item => {
                    const { id, ...rest } = item;
                    const newRef = doc(collection(db, COLLECTION_NAME));
                    batch.set(newRef, { ...rest, createdAt: new Date().toISOString() });
                });
                await batch.commit();
            }
            notify("Importação concluída com sucesso!", "success");
            setShowDeleteModal(false);
        } catch (err) {
            console.error(err);
            notify("Erro ao ler arquivo: " + err.message, "error");
        }
    };
    reader.readAsText(file);
  };

  // EXCEL
  const downloadExcel = (onlyDebtors = false) => {
    const dataToExport = onlyDebtors ? lancamentos.filter(d => d.status === 'pendente') : lancamentos;
    if (dataToExport.length === 0) return notify("Nada para exportar.", "error");
    let html = `<table border="1"><thead><tr style="background-color:#f0f0f0;"><th>Data</th><th>Nota</th><th>Cliente</th><th>Veículo</th><th>Serviços</th><th>Total</th><th>Pago</th><th>Falta</th><th>Status</th><th>Quitado</th></tr></thead><tbody>`;
    dataToExport.forEach(d => {
      const servicosStr = d.servicos.map(s => `${s.nome === 'OUTROS' ? s.customName : s.nome} (${formatCurrency(s.valor)})`).join(' + ');
      const falta = d.total - d.totalPago;
      html += `<tr style="background-color:${d.status === 'pendente' ? '#ffebee' : '#e8f5e9'}"><td>${formatDate(d.data)}</td><td>${d.nota||''}</td><td>${d.cliente}</td><td>${d.carro||''} ${d.modelo||''}</td><td>${servicosStr}</td><td>${d.total.toFixed(2).replace('.',',')}</td><td>${d.totalPago.toFixed(2).replace('.',',')}</td><td style="color:${falta>0?'red':'green'}">${falta>0?falta.toFixed(2).replace('.',','):'0,00'}</td><td>${d.status.toUpperCase()}</td><td>${formatDate(d.quitacao)}</td></tr>`;
    });
    html += `</tbody></table>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = onlyDebtors ? 'Relatorio_Devedores.xls' : 'Relatorio_Geral.xls'; a.click();
    notify("Download iniciado!", "success");
  };

  const filteredData = useMemo(() => lancamentos.filter(i => {
    if (buscaTexto) {
        const textoMatch = JSON.stringify(i).toLowerCase().includes(buscaTexto.toLowerCase());
        const tipoMatch = filtroTipo === 'receber' ? i.status === 'pendente' : true;
        return textoMatch && tipoMatch;
    }
    if (filtroMes && !i.data.startsWith(filtroMes)) return false;
    if (filtroTipo === 'receber' && i.status !== 'pendente') return false;
    return true;
  }), [lancamentos, filtroMes, buscaTexto, filtroTipo]);

  const stats = useMemo(() => filteredData.reduce((acc, c) => ({ faturado: acc.faturado + c.total, recebido: acc.recebido + c.totalPago, pendente: acc.pendente + (c.status === 'pendente' ? (c.total - c.totalPago) : 0) }), { faturado: 0, recebido: 0, pendente: 0 }), [filteredData]);

  const filteredAnalysisData = useMemo(() => lancamentos.filter(i => {
    if (analiseInicio && i.data < analiseInicio) return false;
    if (analiseFim && i.data > analiseFim) return false;
    return true;
  }), [lancamentos, analiseInicio, analiseFim]);

  const analysisStats = useMemo(() => filteredAnalysisData.reduce((acc, c) => ({ faturado: acc.faturado + c.total, recebido: acc.recebido + c.totalPago, pendente: acc.pendente + (c.status === 'pendente' ? (c.total - c.totalPago) : 0) }), { faturado: 0, recebido: 0, pendente: 0 }), [filteredAnalysisData]);

  const serviceStats = useMemo(() => {
    const stats = {};
    filteredAnalysisData.forEach(item => {
      if (item.servicos) {
        item.servicos.forEach(s => {
          let key = s.nome;
          if (key === 'OUTROS' && s.customName) key = `OUTROS (${s.customName.toUpperCase()})`;
          if (!stats[key]) stats[key] = { qtd: 0, total: 0 };
          stats[key].qtd++;
          stats[key].total += Number(s.valor || 0);
        });
      }
    });
    return Object.entries(stats).map(([k, v]) => ({ name: k, ...v })).sort((a, b) => b.total - a.total);
  }, [filteredAnalysisData]);

  const sortedEvolution = useMemo(() => {
    const days = {};
    filteredAnalysisData.forEach(item => {
      const [y, m, d] = item.data.split('-');
      const key = `${d}/${m}`;
      if (!days[key]) days[key] = 0;
      days[key] += item.total;
    });
    return Object.entries(days)
      .map(([label, value]) => ({ label, value }))
      .sort((a,b) => {
          const [da, ma] = a.label.split('/');
          const [db, mb] = b.label.split('/');
          return new Date(2026, ma-1, da) - new Date(2026, mb-1, db);
      });
  }, [filteredAnalysisData]);

  if (configError) return <div className="p-10 text-center text-red-600 font-bold">Erro na Chave do Firebase. Verifique o código.</div>;
  if (!user && loading) return <div className="min-h-screen flex items-center justify-center flex-col gap-4"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /><p className="text-gray-500">Conectando ao Google...</p></div>;

  return (
    <div className="min-h-screen bg-slate-100 pb-20 font-sans text-slate-800">
      {notif && <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-xl text-white font-bold break-words max-w-sm ${notif.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{notif.msg}</div>}
      <header className="bg-indigo-900 text-white p-3 shadow-lg flex justify-between items-center"><div className="flex gap-2 items-center"><Database className="text-indigo-300"/><h1 className="text-xl font-bold">Caixa 4.0 <span className="text-xs font-normal text-indigo-300">• Profissional</span></h1></div>
        <div className="flex gap-2">
            <button onClick={()=>setShowDashboardModal(true)} className="bg-indigo-600 px-3 py-2 rounded text-sm hover:bg-indigo-500 flex gap-2 items-center border border-indigo-400 font-bold shadow-sm"><LayoutDashboard size={16}/> <span className="hidden md:inline">Dashboard</span></button>
            <button onClick={()=>setShowStatsModal(true)} className="bg-blue-800 px-3 py-2 rounded text-sm hover:bg-blue-700 flex gap-2 items-center"><BarChart2 size={16}/> <span className="hidden md:inline">Análise</span></button>
            <button onClick={()=>setShowDeleteModal(true)} className="bg-green-600 px-3 py-2 rounded text-sm font-bold hover:bg-green-500 flex gap-2 items-center"><Settings size={16}/> <span className="hidden md:inline">Admin</span></button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 space-y-6">
        <div className={`rounded-lg shadow-md p-6 border transition-all duration-300 ${isEditing ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-100' : 'bg-white border-gray-200'}`}>
          <div className="flex justify-between mb-6">
            <h2 className={`text-lg font-bold flex items-center gap-2 ${isEditing ? 'text-amber-800' : 'text-gray-800'}`}>{isEditing ? <Edit className="text-amber-600"/> : <Plus className="text-indigo-600"/>} {isEditing ? 'Editando Lançamento' : 'Novo Lançamento'}</h2>
            {isEditing && (<button onClick={()=>{setFormData({ data: new Date().toISOString().slice(0, 10), nota: '', cliente: '', carro: '', modelo: '', servicos: [{ nome: SERVICOS_PADRAO[0], valor: 0, customName: '' }], pagamentos: { pix: 0, dinheiro: 0, debito: 0, credito: 0 }, cartaoDetalhes: { maquina: '', parcelas: '' }, quitacao: '' }); setIsEditing(null)}} className="text-xs font-bold uppercase flex items-center gap-1 text-red-500 hover:text-red-700 bg-white px-3 py-1 rounded border border-red-100 shadow-sm"><X size={14}/> Cancelar Edição</button>)}
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Data</label><input type="date" name="data" value={formData.data} onChange={handleInputChange} className="w-full border p-2.5 rounded outline-none focus:ring-2 focus:ring-indigo-500" required /></div>
              <div className="md:col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Nota</label><input name="nota" value={formData.nota} onChange={handleInputChange} className="w-full border p-2.5 rounded outline-none focus:ring-2 focus:ring-indigo-500" /></div>
              <div className="md:col-span-4"><label className="text-xs font-bold text-gray-500 uppercase">Cliente</label><input name="cliente" value={formData.cliente} onChange={handleInputChange} className="w-full border p-2.5 rounded uppercase font-bold outline-none focus:ring-2 focus:ring-indigo-500" required /></div>
              <div className="md:col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Carro</label><input name="carro" value={formData.carro} onChange={handleInputChange} className="w-full border p-2.5 rounded uppercase outline-none focus:ring-2 focus:ring-indigo-500" /></div>
              <div className="md:col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Modelo</label><input name="modelo" value={formData.modelo} onChange={handleInputChange} className="w-full border p-2.5 rounded uppercase outline-none focus:ring-2 focus:ring-indigo-500" /></div>
            </div>
            <div className={`p-4 rounded border ${isEditing ? 'bg-amber-100/50' : 'bg-gray-50'}`}>
               <label className="text-xs font-bold text-gray-500 uppercase mb-3 block">Serviços</label>
               {formData.servicos.map((s, i) => (
                 <div key={i} className="flex gap-3 mb-3 items-center flex-col md:flex-row"><select value={s.nome} onChange={(e)=>{const ns=[...formData.servicos];ns[i].nome=e.target.value;setFormData({...formData,servicos:ns})}} className="w-full md:w-1/3 border p-2.5 rounded bg-white">{SERVICOS_PADRAO.map(o=><option key={o}>{o}</option>)}</select><input value={s.customName||''} onChange={(e)=>{const ns=[...formData.servicos];ns[i].customName=e.target.value;setFormData({...formData,servicos:ns})}} placeholder="Descrição" className="w-full md:flex-1 border p-2.5 rounded"/><div className="w-full md:w-32"><InputMoney value={s.valor} onChange={(e)=>{const ns=[...formData.servicos];ns[i].valor=e.target.value;setFormData({...formData,servicos:ns})}} className="p-2.5"/></div>{formData.servicos.length>1&&<button type="button" onClick={()=>{const ns=formData.servicos.filter((_,x)=>x!==i);setFormData({...formData,servicos:ns})}} className="text-red-400"><MinusCircle/></button>}</div>
               ))}
               <button type="button" onClick={()=>setFormData(p=>({...p, servicos:[...p.servicos,{nome:SERVICOS_PADRAO[0],valor:0,customName:''}]}))} className="text-sm font-bold text-indigo-600 flex gap-1 items-center"><Plus size={16}/> Adicionar Item</button>
            </div>
            <div className="grid md:grid-cols-12 gap-4 items-end"><div className="md:col-span-3"><label className="text-xs font-bold text-indigo-800 uppercase">TOTAL</label><div className="bg-indigo-50 border border-indigo-200 p-2.5 text-right font-bold text-xl text-indigo-800 rounded">{formatCurrency(totalServico)}</div></div><div className="md:col-span-9 grid grid-cols-2 md:grid-cols-4 gap-3">{['pix','dinheiro','debito','credito'].map(k=><div key={k}><label className="text-[10px] font-bold uppercase mb-1 block">{k}</label><InputMoney name={k} value={formData.pagamentos[k]} onChange={(e)=>handleInputChange(e,'pagamentos')} bg={isEditing ? "bg-white" : "bg-gray-50"}/></div>)}</div></div>
            <div className="grid md:grid-cols-12 gap-4"><div className="md:col-span-3"><label className="text-xs font-bold text-gray-500 uppercase">Máquina</label><input list="maquinas" name="maquina" value={formData.cartaoDetalhes.maquina} onChange={(e)=>handleInputChange(e,'cartao')} className="w-full border p-2.5 rounded"/><datalist id="maquinas">{MAQUINAS_CARTAO.map(m=><option key={m} value={m}/>)}</datalist></div><div className="md:col-span-3"><label className="text-xs font-bold text-gray-500 uppercase">Quitação</label><input type="date" name="quitacao" value={formData.quitacao} onChange={handleInputChange} className="w-full border p-2.5 rounded"/></div><div className="md:col-span-3"><label className="text-xs font-bold text-gray-500 uppercase">Parcelas</label><input name="parcelas" value={formData.cartaoDetalhes.parcelas} onChange={(e)=>handleInputChange(e,'cartao')} className="w-full border p-2.5 rounded"/></div><div className="md:col-span-3 bg-gray-50 border p-2 rounded flex justify-between items-center px-4"><span className={`text-sm font-bold ${totalServico-totalPago>0.01?'text-red-500':'text-green-600'}`}>{totalServico-totalPago>0.01?`Falta: ${formatCurrency(totalServico-totalPago)}`:'Pago: '+formatCurrency(totalPago)}</span></div></div>
            <button className={`w-full text-white font-bold py-3 rounded shadow text-lg flex justify-center gap-2 transition-colors ${isEditing ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}><Save/> {isEditing?'Salvar Alterações':'Lançar'}</button>
          </form>
        </div>
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
           <div className="flex gap-3 mb-4 p-2 bg-gray-50 rounded flex-col md:flex-row items-center">
              <div className="relative flex-1 w-full"><Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4"/><input placeholder="Buscar em todo histórico (Ignora o mês)..." value={buscaTexto} onChange={e=>setBuscaTexto(e.target.value)} className="w-full pl-9 border p-2 rounded text-sm focus:ring-2 focus:ring-indigo-500"/></div>
              <div className="flex items-center gap-2 w-full md:w-auto"><input type="month" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} className={`border p-2 rounded text-sm w-full md:w-auto ${buscaTexto ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={!!buscaTexto} title={buscaTexto ? "Busca ativa: Filtro de mês ignorado" : "Filtrar por mês"}/>{buscaTexto && <button onClick={()=>setBuscaTexto('')} className="p-2 text-red-500 hover:bg-red-50 rounded" title="Limpar Busca"><X size={16}/></button>}</div>
              <div className="flex gap-2 w-full md:w-auto overflow-x-auto"><button onClick={()=>setFiltroTipo('todos')} className={`px-3 py-2 rounded font-bold text-xs ${filtroTipo==='todos'?'bg-indigo-600 text-white':'bg-gray-200 text-gray-700'}`}>Todos</button><button onClick={()=>setFiltroTipo('receber')} className={`px-3 py-2 rounded font-bold text-xs ${filtroTipo==='receber'?'bg-red-600 text-white':'bg-red-100 text-red-700'}`}>A Receber</button></div>
              <div className="flex gap-2 w-full md:w-auto justify-end border-l pl-2 border-gray-300"><button onClick={()=>downloadExcel(false)} className="flex items-center gap-1 bg-green-100 text-green-700 border border-green-200 px-3 py-2 rounded text-xs font-bold hover:bg-green-200 whitespace-nowrap"><Download size={14}/> Geral</button><button onClick={()=>downloadExcel(true)} className="flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 px-3 py-2 rounded text-xs font-bold hover:bg-red-200 whitespace-nowrap"><Download size={14}/> Devedores</button></div>
           </div>
           <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-600 font-bold border-b"><tr><th className="p-3">Data</th><th className="p-3">Cliente</th><th className="p-3">Serviço</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Recebido</th><th className="p-3 text-center">Status</th><th className="p-3 text-center">Ações</th></tr></thead><tbody className="divide-y divide-gray-100">
              {filteredData.map(i => (<tr key={i.id} className="hover:bg-indigo-50/30"><td className="p-3 align-top"><div className="font-bold text-gray-900">{formatDate(i.data)}</div>{i.nota&&<div className="text-sm text-gray-400 mt-0.5 font-normal">{i.nota}</div>}</td><td className="p-3 align-top"><div className="font-bold text-gray-900 uppercase">{i.cliente}</div><div className="text-xs text-indigo-600 font-bold mt-1 uppercase flex items-center gap-1"><Car size={14}/> {i.carro} {i.modelo}</div></td><td className="p-3 align-top text-gray-600">{i.servicos[0]?.nome + (i.servicos.length>1?` +${i.servicos.length-1}`:'')}</td><td className="p-3 align-top text-right font-bold">{formatCurrency(i.total)}</td><td className="p-3 align-top text-right"><div className="text-green-700 font-bold">{formatCurrency(i.totalPago)}</div></td><td className="p-3 align-top text-center">{i.status==='pago'?<div><span className="text-xs font-bold text-green-600 block">PAGO</span><span className="text-[10px] text-gray-400">{formatDate(i.quitacao)}</span></div>:<span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded">Falta {formatCurrency(i.total-i.totalPago)}</span>}</td><td className="p-3 align-top text-center"><div className="flex justify-center gap-2"><button onClick={()=>{setFormData(i);setIsEditing(i.id);window.scrollTo({top:0,behavior:'smooth'})}} className="text-indigo-500"><Edit size={18}/></button><button onClick={()=>requestDelete(i)} className="text-red-400 hover:text-red-600"><Trash2 size={18}/></button></div></td></tr>))}
           </tbody><tfoot className="bg-gray-50 border-t font-bold text-gray-700"><tr><td colSpan="3" className="p-3 text-right">TOTAIS</td><td className="p-3 text-right">{formatCurrency(stats.faturado)}</td><td className="p-3 text-right text-green-700">{formatCurrency(stats.recebido)}</td><td className="p-3 text-center text-red-600">{formatCurrency(stats.pendente)}</td><td></td></tr></tfoot></table></div>
        </div>
      </main>
      
      {showDashboardModal && <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-2 animate-fade-in overflow-y-auto">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl border border-slate-700 my-4 flex flex-col max-h-[95vh]">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50 sticky top-0 z-10 rounded-t-xl">
                <h3 className="font-bold text-xl flex items-center gap-2 text-slate-800"><LayoutDashboard className="text-indigo-600"/> Dashboard Gerencial</h3>
                <button onClick={()=>setShowDashboardModal(false)} className="text-gray-400 hover:text-gray-800"><X size={24}/></button>
            </div>
            <div className="p-6 overflow-y-auto">
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 flex flex-wrap gap-4 items-end mb-6">
                    <div className="flex-1 min-w-[120px]"><label className="text-[10px] uppercase font-bold text-indigo-800 mb-1 block">Data Inicial</label><input type="date" value={analiseInicio} onChange={e=>setAnaliseInicio(e.target.value)} className="w-full p-2 rounded border border-indigo-200 text-sm font-bold text-indigo-900"/></div>
                    <div className="flex-1 min-w-[120px]"><label className="text-[10px] uppercase font-bold text-indigo-800 mb-1 block">Data Final</label><input type="date" value={analiseFim} onChange={e=>setAnaliseFim(e.target.value)} className="w-full p-2 rounded border border-indigo-200 text-sm font-bold text-indigo-900"/></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-gray-400 uppercase">Faturamento Total</p><h3 className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(analysisStats.faturado)}</h3></div><div className="p-2 bg-blue-50 rounded-lg text-blue-600"><TrendingUp size={20}/></div></div></div>
                    <div className="bg-white p-4 rounded-xl border-l-4 border-green-500 shadow-sm"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-gray-400 uppercase">Recebido em Caixa</p><h3 className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(analysisStats.recebido)}</h3></div><div className="p-2 bg-green-50 rounded-lg text-green-600"><DollarSign size={20}/></div></div></div>
                    <div className="bg-white p-4 rounded-xl border-l-4 border-red-500 shadow-sm"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-gray-400 uppercase">Pendente a Receber</p><h3 className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(analysisStats.pendente)}</h3></div><div className="p-2 bg-red-50 rounded-lg text-red-600"><AlertTriangle size={20}/></div></div></div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm"><h4 className="font-bold text-gray-700 mb-4 flex items-center gap-2 text-sm"><BarChart2 size={16}/> Evolução de Faturamento (Dia a Dia)</h4><div className="h-48 flex items-end gap-2 border-b border-gray-200 pb-2 overflow-x-auto">{sortedEvolution.length > 0 ? (<SimpleBarChart data={sortedEvolution} />) : (<div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Sem dados no período</div>)}</div></div>
                    <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm"><h4 className="font-bold text-gray-700 mb-4 flex items-center gap-2 text-sm"><PieChart size={16}/> Top 5 Serviços (Faturamento)</h4>{serviceStats.length > 0 ? (<SimplePieChart data={serviceStats.slice(0, 5).map(s => ({ label: s.name, value: s.total }))} />) : (<div className="h-40 flex items-center justify-center text-gray-400 text-xs">Sem dados</div>)}</div>
                </div>
                <div className="mt-6"><h4 className="font-bold text-gray-700 mb-3 text-sm">Resumo por Serviço (Detalhado)</h4><div className="border rounded-lg overflow-hidden bg-white"><table className="w-full text-xs"><thead className="bg-gray-100 font-bold text-gray-500"><tr><th className="p-3 text-left">Serviço</th><th className="p-3 text-center">Qtd</th><th className="p-3 text-right">Total Gerado</th><th className="p-3 text-right">Ticket Médio</th></tr></thead><tbody className="divide-y divide-gray-50">{serviceStats.map((s, i) => (<tr key={i} className="hover:bg-gray-50"><td className="p-3 font-medium text-gray-700">{s.name}</td><td className="p-3 text-center text-gray-500">{s.qtd}</td><td className="p-3 text-right font-bold text-blue-700">{formatCurrency(s.total)}</td><td className="p-3 text-right text-gray-400">{formatCurrency(s.total/s.qtd)}</td></tr>))}</tbody></table></div></div>
            </div>
            <div className="p-4 border-t bg-gray-50 text-right rounded-b-xl"><button onClick={()=>setShowDashboardModal(false)} className="px-6 py-2 bg-slate-800 text-white rounded font-bold hover:bg-slate-700">Fechar Dashboard</button></div>
        </div>
      </div>}

      {showStatsModal && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><BarChart2/> Resumo Rápido</h3>
            <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100 flex gap-2 items-center justify-between"><div className="flex flex-col gap-1 flex-1"><label className="text-[10px] uppercase font-bold text-blue-800">De:</label><input type="date" value={analiseInicio} onChange={e=>setAnaliseInicio(e.target.value)} className="w-full text-xs p-1 rounded border"/></div><div className="flex flex-col gap-1 flex-1"><label className="text-[10px] uppercase font-bold text-blue-800">Até:</label><input type="date" value={analiseFim} onChange={e=>setAnaliseFim(e.target.value)} className="w-full text-xs p-1 rounded border"/></div></div>
            <div className="grid grid-cols-2 gap-4 mb-6"><div className="bg-gray-50 p-3 rounded border"><span className="text-xs text-gray-500 font-bold">FATURADO</span><div className="text-lg font-bold">{formatCurrency(analysisStats.faturado)}</div></div><div className="bg-green-50 p-3 rounded border border-green-100"><span className="text-xs text-green-600 font-bold">RECEBIDO</span><div className="text-lg font-bold text-green-700">{formatCurrency(analysisStats.recebido)}</div></div><div className="bg-red-50 p-3 rounded border border-red-100"><span className="text-xs text-red-600 font-bold">A RECEBER</span><div className="text-lg font-bold text-red-700">{formatCurrency(analysisStats.pendente)}</div></div><div className="bg-blue-50 p-3 rounded border border-blue-100"><span className="text-xs text-blue-600 font-bold">SERVIÇOS</span><div className="text-lg font-bold text-blue-700">{filteredAnalysisData.length}</div></div></div>
            <button onClick={() => setShowServiceDetails(!showServiceDetails)} className="w-full bg-blue-100 hover:bg-blue-200 text-blue-800 py-3 rounded-lg font-bold mb-4 flex items-center justify-center gap-2 border border-blue-200 shadow-sm">{showServiceDetails ? <MinusCircle size={16}/> : <Plus size={16}/>} {showServiceDetails ? 'Ocultar Detalhes' : 'Ver Faturamento por Serviço'}</button>
            {showServiceDetails && (<div className="border rounded-lg overflow-hidden mb-4 bg-gray-50 animate-fade-in"><div className="max-h-60 overflow-y-auto"><table className="w-full text-sm"><thead className="bg-gray-100 text-gray-500 font-bold text-xs sticky top-0"><tr><th className="p-2 text-left">Serviço</th><th className="p-2 text-right">Qtd</th><th className="p-2 text-right">Total</th></tr></thead><tbody className="divide-y">{serviceStats.map(stat => (<tr key={stat.name}><td className="p-2 text-gray-700 font-medium truncate max-w-[150px]" title={stat.name}>{stat.name}</td><td className="p-2 text-right text-gray-500">{stat.qtd}</td><td className="p-2 text-right font-bold text-blue-700">{formatCurrency(stat.total)}</td></tr>))}</tbody></table></div></div>)}
            <button onClick={()=>setShowStatsModal(false)} className="mt-2 w-full bg-slate-800 text-white py-3 rounded font-bold hover:bg-slate-700">Fechar</button>
        </div>
      </div>}
      
      {showDeleteModal && <div className="fixed inset-0 bg-red-900/80 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded p-6 w-full max-w-sm text-center">
            <h3 className="font-bold text-red-700 text-lg mb-3">ADMINISTRAÇÃO</h3>
            <input type="password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)} placeholder="Digite a Senha Mestra" className="border p-3 w-full mb-4 text-center rounded text-lg"/>
            <div className="space-y-3">
                <button onClick={handleBackup} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full py-3 rounded font-bold text-sm flex items-center justify-center gap-2"><Download size={16}/> BACKUP COMPLET0 (JSON)</button>
                <div className="relative">
                    <input type="file" accept=".json" onChange={handleRestore} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" ref={fileInputRef}/>
                    <button className="bg-amber-600 hover:bg-amber-700 text-white w-full py-3 rounded font-bold text-sm flex items-center justify-center gap-2"><Upload size={16}/> RESTAURAR BACKUP</button>
                </div>
                <div className="border-t border-gray-200 my-2 pt-2"></div>
                <button onClick={handleDeleteOld} className="bg-blue-600 hover:bg-blue-700 text-white w-full py-3 rounded font-bold text-sm flex items-center justify-center gap-2"><Clock size={16}/> LIMPAR ANTIGOS (+3 Meses)</button>
                <button onClick={handleDeleteAll} className="bg-red-600 hover:bg-red-700 text-white w-full py-3 rounded font-bold text-sm flex items-center justify-center gap-2"><Trash2 size={16}/> ZERAR TUDO (PERIGO)</button>
            </div>
            <button onClick={()=>setShowDeleteModal(false)} className="mt-4 text-sm text-gray-500 hover:text-gray-800 underline">Cancelar</button>
        </div>
      </div>}

      {itemToDelete && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center border-2 border-red-100">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 className="text-red-600 w-8 h-8" /></div>
                <h3 className="font-bold text-xl text-gray-800 mb-2">Apagar Lançamento?</h3>
                <p className="text-sm text-gray-500 mb-6">Você vai apagar o serviço de <br/><strong className="text-gray-800 text-lg">{itemToDelete.cliente}</strong><br/>Valor: <strong>{formatCurrency(itemToDelete.total)}</strong></p>
                <div className="space-y-3"><button onClick={confirmDelete} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2">SIM, APAGAR</button><button onClick={() => setItemToDelete(null)} className="w-full py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Cancelar</button></div>
            </div>
        </div>
      )}
    </div>
  );
}