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

// ✅ CONFIGURAÇÃO FIREBASE (NÃO MEXER)
const firebaseConfig = {
  apiKey: "AIzaSyDljmh5wiYtFOQtPwcO5Wyfwg3NVJrjOYc",
  authDomain: "retifica-caixa.firebaseapp.com",
  projectId: "retifica-caixa",
  storageBucket: "retifica-caixa.firebasestorage.app",
  messagingSenderId: "520983797933",
  appId: "1:520983797933:web:0e886653472bec6cd6e624"
};

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
    <div className={`input-money-container ${bg} ${className}`}>
      <span className="currency-symbol">R$</span>
      <input type="text" inputMode="numeric" name={name} value={value ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(value) : ''} onChange={handleChange} placeholder="0,00" />
    </div>
  );
};

// --- GRÁFICOS ---
const SimpleBarChart = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end justify-between h-40 gap-1 pt-6 px-2 w-full border-b border-gray-200">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1 group relative">
          <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-slate-800 text-white px-1 rounded whitespace-nowrap z-10 font-bold">{formatCurrency(d.value)}</div>
          <div className="w-full bg-blue-600 rounded-t hover:bg-blue-500 transition-all cursor-pointer" style={{ height: `${(d.value / maxVal) * 100}%` }}></div>
          <span className="text-[8px] text-gray-500 mt-1 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

const SimplePieChart = ({ data }) => {
  const colors = ['#1e40af', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];
  const total = data.reduce((acc, curr) => acc + curr.value, 0);
  let cumulativePercent = 0;
  const gradient = data.map((d, i) => {
    const percent = (d.value / total) * 100;
    const start = cumulativePercent;
    cumulativePercent += percent;
    return `${colors[i % colors.length]} ${start}% ${cumulativePercent}%`;
  }).join(', ');
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="w-32 h-32 rounded-full shadow-inner relative flex-shrink-0 border-2 border-white" style={{ background: `conic-gradient(${gradient || '#e2e8f0 0% 100%'})` }}>
        <div className="absolute inset-4 bg-white rounded-full flex items-center justify-center">
           <span className="text-[10px] font-bold text-gray-400 text-center leading-tight uppercase">Serviços</span>
        </div>
      </div>
      <div className="flex-1 text-xs space-y-1 w-full">
        {data.map((d, i) => (
          <div key={i} className="flex justify-between items-center bg-white p-1 rounded border border-gray-100 shadow-sm">
            <div className="flex items-center gap-1 overflow-hidden"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{background: colors[i % colors.length]}}></span><span className="truncate">{d.label}</span></div>
            <span className="font-bold text-blue-800">{Math.round((d.value/total)*100)}%</span>
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
  const [showDashboardModal, setShowDashboardModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [itemToDelete, setItemToDelete] = useState(null);
  const fileInputRef = useRef(null);

  const { app, auth, db } = useMemo(() => {
    const appInstance = initializeApp(firebaseConfig);
    return { app: appInstance, auth: getAuth(appInstance), db: getFirestore(appInstance) };
  }, []);

  useEffect(() => { 
    signInAnonymously(auth);
    return onAuthStateChanged(auth, setUser); 
  }, [auth]);

  useEffect(() => {
    if (!user || !db) return;
    return onSnapshot(collection(db, COLLECTION_NAME), (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (new Date(b.data) - new Date(a.data)) || (new Date(b.createdAt) - new Date(a.createdAt)));
      setLancamentos(data);
      setLoading(false);
    });
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
    if (!formData.cliente) return notify("Preencha o cliente", "error");
    const pl = { ...formData, total: totalServico, totalPago, saldo: safeMath(totalPago - totalServico), status: totalPago >= totalServico ? 'pago' : 'pendente', updatedAt: new Date().toISOString() };
    try {
      if (isEditing) await updateDoc(doc(db, COLLECTION_NAME, isEditing), pl);
      else await addDoc(collection(db, COLLECTION_NAME), { ...pl, createdAt: new Date().toISOString() });
      setFormData({ data: new Date().toISOString().slice(0, 10), nota: '', cliente: '', carro: '', modelo: '', servicos: [{ nome: SERVICOS_PADRAO[0], valor: 0, customName: '' }], pagamentos: { pix: 0, dinheiro: 0, debito: 0, credito: 0 }, cartaoDetalhes: { maquina: '', parcelas: '' }, quitacao: '' }); setIsEditing(null);
      notify("✅ Lançamento realizado!");
    } catch (e) { notify("Erro ao salvar", "error"); }
  };

  const notify = (msg, type) => { setNotif({ msg, type }); setTimeout(() => setNotif(null), 5000); };
  const confirmDelete = async () => {
    try { await deleteDoc(doc(db, COLLECTION_NAME, itemToDelete.id)); notify("🗑️ Apagado!"); setItemToDelete(null); } 
    catch (e) { notify("Erro ao apagar", "error"); }
  };

  const handleBackup = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(lancamentos, null, 2)], { type: "application/json" }));
    a.download = `Backup_V4_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    notify("📂 Backup salvo!");
  };

  const handleRestore = (e) => {
    if (deletePassword !== SENHA_MESTRA) return notify("Senha Incorreta", "error");
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);
            const batchSize = 300;
            for (let i = 0; i < data.length; i += batchSize) {
                const batch = writeBatch(db);
                data.slice(i, i + batchSize).forEach(item => {
                    const { id, ...rest } = item;
                    batch.set(doc(collection(db, COLLECTION_NAME)), { ...rest, createdAt: new Date().toISOString() });
                });
                await batch.commit();
            }
            notify("📥 Dados restaurados!"); setShowDeleteModal(false);
        } catch (err) { notify("Erro no arquivo", "error"); }
    };
    reader.readAsText(file);
  };

  const filteredData = useMemo(() => lancamentos.filter(i => {
    if (buscaTexto) return JSON.stringify(i).toLowerCase().includes(buscaTexto.toLowerCase());
    return i.data.startsWith(filtroMes) && (filtroTipo === 'receber' ? i.status === 'pendente' : true);
  }), [lancamentos, filtroMes, buscaTexto, filtroTipo]);

  const analysisStats = useMemo(() => {
    const data = lancamentos.filter(i => (!analiseInicio || i.data >= analiseInicio) && (!analiseFim || i.data <= analiseFim));
    return data.reduce((acc, c) => ({ faturado: acc.faturado + c.total, recebido: acc.recebido + c.totalPago, pendente: acc.pendente + (c.status === 'pendente' ? (c.total - c.totalPago) : 0), count: acc.count + 1, data }), { faturado: 0, recebido: 0, pendente: 0, count: 0, data: [] });
  }, [lancamentos, analiseInicio, analiseFim]);

  const serviceStats = useMemo(() => {
    const stats = {};
    analysisStats.data.forEach(item => item.servicos?.forEach(s => {
      let key = s.nome === 'OUTROS' ? `OUTROS (${s.customName?.toUpperCase()})` : s.nome;
      if (!stats[key]) stats[key] = { qtd: 0, total: 0 };
      stats[key].qtd++; stats[key].total += Number(s.valor || 0);
    }));
    return Object.entries(stats).map(([k, v]) => ({ name: k, ...v })).sort((a, b) => b.total - a.total);
  }, [analysisStats]);

  if (!user && loading) return <div className="loading-screen"><Loader2 className="spin" /> CARREGANDO CAIXA...</div>;

  return (
    <div className="main-wrapper">
      {/* CSS INTERNO PARA BLINDAR O DESIGN */}
      <style>{`
        .main-wrapper { min-height: 100vh; background-color: #f1f5f9; font-family: sans-serif; padding-bottom: 50px; }
        .header { background-color: #1e3a8a; color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); position: sticky; top: 0; z-index: 50; }
        .header h1 { font-size: 1.25rem; font-weight: bold; margin: 0; }
        .btn-group { display: flex; gap: 8px; }
        .btn-header { background-color: #1d4ed8; color: white; border: 1px solid #3b82f6; padding: 8px 12px; border-radius: 6px; font-weight: bold; font-size: 0.875rem; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
        .btn-header:hover { background-color: #2563eb; }
        .btn-admin { background-color: #16a34a; border-color: #22c55e; }
        .container { max-width: 1100px; margin: 20px auto; padding: 0 15px; }
        .card { background: white; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; padding: 25px; margin-bottom: 25px; }
        .form-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 15px; margin-bottom: 20px; }
        .col-2 { grid-column: span 2; } .col-4 { grid-column: span 4; }
        label { display: block; font-size: 10px; font-weight: bold; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
        input, select { width: 100%; border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; font-size: 14px; outline: none; transition: border 0.2s; }
        input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
        .services-area { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; margin-bottom: 20px; }
        .service-row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
        .input-money-container { position: relative; border: 1px solid #cbd5e1; border-radius: 8px; background: white; display: flex; align-items: center; overflow: hidden; }
        .currency-symbol { padding-left: 10px; font-size: 12px; font-weight: bold; color: #94a3b8; }
        .input-money-container input { border: none; text-align: right; font-weight: bold; color: #1e293b; padding-right: 10px; }
        .total-display { background-color: #1e40af; color: white; padding: 15px; border-radius: 10px; text-align: right; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
        .total-display span { font-size: 24px; font-weight: 900; }
        .btn-submit { width: 100%; background-color: #2563eb; color: white; font-weight: 900; padding: 15px; border-radius: 10px; border: none; font-size: 18px; cursor: pointer; box-shadow: 0 10px 15px -3px rgba(37,99,235,0.3); transition: transform 0.1s; }
        .btn-submit:active { transform: scale(0.98); }
        .table-area { overflow-x: auto; margin-top: 30px; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; }
        th { background-color: #f8fafc; color: #64748b; font-size: 11px; text-transform: uppercase; padding: 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        td { padding: 15px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        .status-pago { color: #059669; font-weight: 900; font-size: 10px; background: #ecfdf5; padding: 4px 8px; border-radius: 6px; }
        .status-divida { color: #dc2626; font-weight: 900; font-size: 10px; background: #fef2f2; padding: 4px 8px; border-radius: 6px; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-blur: 5px; }
        .modal { background: white; border-radius: 20px; max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 30px; position: relative; }
        .loading-screen { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: bold; color: #64748b; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) { .form-grid { grid-template-columns: 1fr; } .col-2, .col-4 { grid-column: span 12; } .service-row { flex-direction: column; align-items: stretch; } }
      `}</style>

      {notif && <div className={`fixed top-4 right-4 z-[200] px-6 py-4 rounded-xl shadow-2xl text-white font-bold ${notif.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{notif.msg}</div>}
      
      <header className="header">
        <div className="flex gap-3 items-center"><Database className="text-blue-300" size={20}/><h1>RETÍFICA CAIXA 4.0</h1></div>
        <div className="btn-group">
            <button onClick={()=>setShowDashboardModal(true)} className="btn-header"><LayoutDashboard size={16}/><span>Dashboard</span></button>
            <button onClick={()=>setShowDeleteModal(true)} className="btn-header btn-admin"><Settings size={16}/><span>Admin</span></button>
        </div>
      </header>

      <main className="container">
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">{isEditing ? <Edit className="text-amber-500"/> : <Plus className="text-blue-600"/>} {isEditing ? 'EDITAR LANÇAMENTO' : 'NOVO LANÇAMENTO'}</h2>
            {isEditing && (<button onClick={()=>{setFormData({ data: new Date().toISOString().slice(0, 10), nota: '', cliente: '', carro: '', modelo: '', servicos: [{ nome: SERVICOS_PADRAO[0], valor: 0, customName: '' }], pagamentos: { pix: 0, dinheiro: 0, debito: 0, credito: 0 }, cartaoDetalhes: { maquina: '', parcelas: '' }, quitacao: '' }); setIsEditing(null)}} className="text-xs font-bold text-red-500 hover:underline">CANCELAR</button>)}
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="col-2"><label>Data</label><input type="date" name="data" value={formData.data} onChange={handleInputChange} required /></div>
              <div className="col-2"><label>Nota/OS</label><input name="nota" value={formData.nota} onChange={handleInputChange} placeholder="Ex: 550" /></div>
              <div className="col-4"><label>Cliente</label><input name="cliente" value={formData.cliente} onChange={handleInputChange} placeholder="NOME DO CLIENTE" className="uppercase font-bold" required /></div>
              <div className="col-2"><label>Placa</label><input name="carro" value={formData.carro} onChange={handleInputChange} placeholder="PLACA" className="uppercase" /></div>
              <div className="col-2"><label>Motor</label><input name="modelo" value={formData.modelo} onChange={handleInputChange} placeholder="MODELO" className="uppercase" /></div>
            </div>
            
            <div className="services-area">
               <label>Serviços Realizados</label>
               {formData.servicos.map((s, i) => (
                 <div key={i} className="service-row">
                    <select value={s.nome} onChange={(e)=>{const ns=[...formData.servicos];ns[i].nome=e.target.value;setFormData({...formData,servicos:ns})}} className="font-bold">
                        {SERVICOS_PADRAO.map(o=><option key={o}>{o}</option>)}
                    </select>
                    <input value={s.customName||''} onChange={(e)=>{const ns=[...formData.servicos];ns[i].customName=e.target.value;setFormData({...formData,servicos:ns})}} placeholder="O que foi feito?" style={{flex: 1}} />
                    <div style={{width: '150px'}}><InputMoney value={s.valor} onChange={(e)=>{const ns=[...formData.servicos];ns[i].valor=e.target.value;setFormData({...formData,servicos:ns})}} /></div>
                    {formData.servicos.length>1 && <button type="button" onClick={()=>{const ns=formData.servicos.filter((_,x)=>x!==i);setFormData({...formData,servicos:ns})}} className="text-red-500"><MinusCircle/></button>}
                 </div>
               ))}
               <button type="button" onClick={()=>setFormData(p=>({...p, servicos:[...p.servicos,{nome:SERVICOS_PADRAO[0],valor:0,customName:''}]}))} className="text-xs font-bold text-blue-600 flex items-center gap-1 mt-2"> + ADICIONAR ITEM</button>
            </div>

            <div className="form-grid items-center">
              <div className="col-4"><div className="total-display"><label style={{color: '#93c5fd'}}>Total do Orçamento</label><span>{formatCurrency(totalServico)}</span></div></div>
              <div className="col-8">
                <div className="form-grid" style={{marginBottom: 0}}>
                    {['pix','dinheiro','debito','credito'].map(k=><div key={k} className="col-2"><label className="text-center">{k}</label><InputMoney name={k} value={formData.pagamentos[k]} onChange={(e)=>handleInputChange(e,'pagamentos')} className="text-center"/></div>)}
                </div>
              </div>
            </div>

            <div className="form-grid pt-4 mt-4 border-t border-slate-100">
              <div className="col-4"><label>Máquina</label><input list="maquinas" name="maquina" value={formData.cartaoDetalhes.maquina} onChange={(e)=>handleInputChange(e,'cartao')} placeholder="Máquina usada"/><datalist id="maquinas">{MAQUINAS_CARTAO.map(m=><option key={m} value={m}/>)}</datalist></div>
              <div className="col-2"><label>Parcelas</label><input name="parcelas" value={formData.cartaoDetalhes.parcelas} onChange={(e)=>handleInputChange(e,'cartao')} placeholder="3x" /></div>
              <div className="col-3"><label>Data Quitação</label><input type="date" name="quitacao" value={formData.quitacao} onChange={handleInputChange} /></div>
              <div className="col-3">
                <label className="text-center">Saldo</label>
                <div className={`p-2 rounded text-center font-black ${totalServico-totalPago>0.01?'status-divida':'status-pago'}`} style={{fontSize: '16px'}}>
                    {totalServico-totalPago>0.01?`- ${formatCurrency(totalServico-totalPago)}`:'PAGO'}
                </div>
              </div>
            </div>
            
            <button className="btn-submit mt-6"><Save size={20}/> {isEditing?'SALVAR ALTERAÇÕES':'FINALIZAR LANÇAMENTO'}</button>
          </form>
        </div>

        {/* BUSCA E FILTROS */}
        <div className="card" style={{padding: '15px'}}>
           <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={16}/><input placeholder="Procurar cliente ou serviço..." value={buscaTexto} onChange={e=>setBuscaTexto(e.target.value)} className="pl-10" /></div>
              <div className="flex gap-2">
                <input type="month" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} className="font-bold text-blue-900" style={{width: '160px'}}/>
                <button onClick={()=>setFiltroTipo(filtroTipo==='todos'?'receber':'todos')} className={`px-4 rounded-lg font-bold text-xs ${filtroTipo==='receber'?'bg-red-600 text-white':'bg-slate-200 text-slate-600'}`}>{filtroTipo==='receber'?'VENDO DÉBITOS':'VER TUDO'}</button>
              </div>
           </div>
           
           <div className="table-area">
             <table>
               <thead>
                 <tr><th>Data</th><th>Cliente</th><th>Serviço</th><th style={{textAlign:'right'}}>Total</th><th style={{textAlign:'right'}}>Pago</th><th style={{textAlign:'center'}}>Status</th><th style={{textAlign:'center'}}>Ações</th></tr>
               </thead>
               <tbody>
                 {filteredData.map(i => (
                   <tr key={i.id}>
                     <td><div className="font-bold">{formatDate(i.data)}</div><div className="text-[10px] text-slate-400">{i.nota}</div></td>
                     <td><div className="font-bold uppercase">{i.cliente}</div><div className="text-[10px] text-blue-600 uppercase flex items-center gap-1"><Car size={12}/> {i.carro} {i.modelo}</div></td>
                     <td className="text-xs text-slate-500 italic">{i.servicos[0]?.nome}</td>
                     <td style={{textAlign:'right', fontWeight:'bold'}}>{formatCurrency(i.total)}</td>
                     <td style={{textAlign:'right', fontWeight:'bold', color:'#059669'}}>{formatCurrency(i.totalPago)}</td>
                     <td style={{textAlign:'center'}}>{i.status==='pago' ? <span className="status-pago">PAGO</span> : <span className="status-divida">DÉBITO</span>}</td>
                     <td style={{textAlign:'center'}}>
                       <div className="flex justify-center gap-2">
                         <button onClick={()=>{setFormData(i);setIsEditing(i.id);window.scrollTo({top:0,behavior:'smooth'})}} className="text-blue-500"><Edit size={18}/></button>
                         <button onClick={()=>setItemToDelete(i)} className="text-red-400"><Trash2 size={18}/></button>
                       </div>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      </main>
      
      {/* MODAL DASHBOARD */}
      {showDashboardModal && <div className="modal-overlay">
        <div className="modal">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-xl flex items-center gap-2 text-slate-800"><LayoutDashboard className="text-blue-600"/> PAINEL FINANCEIRO</h3>
                <button onClick={()=>setShowDashboardModal(false)} className="text-slate-400"><X size={24}/></button>
            </div>
            <div className="space-y-8">
                <div className="bg-blue-50 p-4 rounded-xl flex gap-4 items-end">
                    <div className="flex-1"><label>Início</label><input type="date" value={analiseInicio} onChange={e=>setAnaliseInicio(e.target.value)} /></div>
                    <div className="flex-1"><label>Fim</label><input type="date" value={analiseFim} onChange={e=>setAnaliseFim(e.target.value)} /></div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><p className="text-[9px] font-bold text-slate-400 uppercase">Faturamento</p><h3 className="text-lg font-bold text-slate-900 leading-none">{formatCurrency(analysisStats.faturado)}</h3></div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><p className="text-[9px] font-bold text-slate-400 uppercase">Em Caixa</p><h3 className="text-lg font-bold text-green-700 leading-none">{formatCurrency(analysisStats.recebido)}</h3></div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><p className="text-[9px] font-bold text-slate-400 uppercase">Dívida</p><h3 className="text-lg font-bold text-red-600 leading-none">{formatCurrency(analysisStats.pendente)}</h3></div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-lg">
                        <h4 className="font-bold text-slate-800 mb-4 text-xs uppercase opacity-60">Evolução Diária</h4>
                        <SimpleBarChart data={Object.entries(analysisStats.data.reduce((a,c)=>{const d=formatDate(c.data).split('/')[0]; a[d]=(a[d]||0)+c.total; return a},{})).map(([l,v])=>({label:l,value:v})).sort((a,b)=>a.label-b.label)} />
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-lg">
                        <h4 className="font-bold text-slate-800 mb-4 text-xs uppercase opacity-60">Principais Serviços</h4>
                        <SimplePieChart data={serviceStats.slice(0, 5).map(s => ({ label: s.name, value: s.total }))} />
                    </div>
                </div>
            </div>
            <button onClick={()=>setShowDashboardModal(false)} className="w-full mt-8 py-3 bg-slate-800 text-white rounded-xl font-bold uppercase text-xs">FECHAR</button>
        </div>
      </div>}

      {/* MODAL ADMIN */}
      {showDeleteModal && <div className="modal-overlay">
        <div className="modal" style={{maxWidth: '400px'}}>
            <h3 className="font-bold text-xl text-center text-red-700 mb-6 uppercase">Administração</h3>
            <input type="password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)} placeholder="Senha Mestra" className="text-center text-2xl font-bold mb-6" style={{background:'#f1f5f9'}}/>
            <div className="space-y-4">
                <button onClick={handleBackup} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-700 shadow-lg transition-all border-b-4 border-blue-800"><Download size={20}/> BAIXAR BACKUP JSON</button>
                <div className="relative">
                    <input type="file" accept=".json" onChange={handleRestore} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" ref={fileInputRef}/>
                    <button className="w-full py-4 bg-amber-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-amber-600 shadow-lg transition-all border-b-4 border-amber-700 uppercase tracking-widest"><Upload size={20}/> Restaurar Backup</button>
                </div>
            </div>
            <button onClick={()=>setShowDeleteModal(false)} className="w-full mt-6 text-xs font-bold text-slate-400 uppercase underline">Sair</button>
        </div>
      </div>}

      {/* MODAL APAGAR */}
      {itemToDelete && (
        <div className="modal-overlay">
            <div className="modal" style={{maxWidth: '350px', textAlign: 'center'}}>
                <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600"><Trash2 size={32}/></div>
                <h3 className="font-bold text-xl text-slate-900 mb-2 uppercase">APAGAR?</h3>
                <p className="text-sm text-slate-500 mb-8 leading-tight">Remover registro de <br/><strong className="text-slate-900 uppercase font-black">{itemToDelete.cliente}</strong></p>
                <div className="space-y-3">
                    <button onClick={confirmDelete} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl shadow-lg uppercase text-xs">SIM, APAGAR AGORA</button>
                    <button onClick={() => setItemToDelete(null)} className="w-full py-3 text-slate-400 font-bold uppercase text-[10px]">VOLTAR</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}