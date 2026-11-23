import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Camera, Check, ChevronRight, CircleHelp, Clock3, Plus, Search, ShoppingBasket, ShoppingCart, SlidersHorizontal, Trash2, Wallet, X } from "lucide-react";
import { calculateSubtotal, formatBRL } from "./lib/money";
import { createItem, loadState, saveState } from "./lib/storage";
import type { Measure, ShoppingItem, ShoppingState } from "./types";

const initialState: ShoppingState = { items: [], budget: 0 };
const categories = ["Mercearia", "Hortifruti", "Carnes", "Laticínios", "Bebidas", "Limpeza", "Higiene", "Outros"];

function App() {
  const [state, setState] = useState<ShoppingState>(initialState);
  const [ready, setReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Mercearia");
  const [measure, setMeasure] = useState<Measure>("un");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [budgetInput, setBudgetInput] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadState().then((saved) => { setState(saved); setBudgetInput(saved.budget ? String(saved.budget) : ""); }).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) void saveState(state);
  }, [state, ready]);

  const totals = useMemo(() => {
    const cents = state.items.reduce((sum, item) => sum + calculateSubtotal(item.unitPrice, item.quantity, item.measure), 0);
    const purchased = state.items.filter((item) => item.checked).reduce((sum, item) => sum + calculateSubtotal(item.unitPrice, item.quantity, item.measure), 0);
    return { cents, purchased, remaining: Math.max(state.budget * 100 - cents, 0) };
  }, [state]);

  const visibleItems = state.items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  const addItem = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedPrice = Number(price.replace(",", "."));
    const parsedQuantity = Number(quantity.replace(",", "."));
    if (!name.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    const kind = measure === "un" ? "unit" : measure === "l" || measure === "ml" ? "volume" : "weight";
    const item = createItem({ name: name.trim(), category, kind, measure, quantity: parsedQuantity, unitPrice: parsedPrice, });
    setState((current) => ({ ...current, items: [item, ...current.items] }));
    setName(""); setPrice(""); setQuantity("1"); setShowForm(false);
  };
  const updateBudget = () => {
    const value = Number(budgetInput.replace(",", "."));
    if (Number.isFinite(value) && value >= 0) setState((current) => ({ ...current, budget: value }));
  };
  const toggleItem = (id: string) => setState((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, checked: !item.checked } : item) }));
  const removeItem = (id: string) => setState((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }));
  const formatItem = (item: ShoppingItem) => {
    const unit = item.measure === "un" ? "un." : item.measure;
    return `${item.quantity.toLocaleString("pt-BR")} ${unit} × ${formatBRL(Math.round(item.unitPrice * 100))}`;
  };
  const notifyScanner = () => setNotice("O leitor OCR de etiquetas será implementado na próxima etapa. Por enquanto, registre o preço manualmente.");
  const boughtCount = state.items.filter((item) => item.checked).length;

  if (!ready) return <main className="loading">Preparando seu SmartMarket…</main>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#"><span className="brand-icon"><ShoppingBasket size={21}/></span><span>Smart<span>Market</span><i>.</i></span></a>
        <p className="nav-caption">SEU ESPAÇO DE COMPRAS</p>
        <nav>
          <a className="nav-link active" href="#overview"><SlidersHorizontal size={18}/> Visão geral <span className="nav-dot"/></a>
          <a className="nav-link" href="#shopping-list"><ShoppingCart size={18}/> Minha lista</a>
          <a className="nav-link" href="#summary"><Clock3 size={18}/> Resumo</a>
        </nav>
        <div className="sidebar-bottom"><div className="offline-note"><span className="online-dot"/><span>Seus dados ficam<br/>no seu aparelho</span></div><small>SmartMarket · versão 0.1.0</small></div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar"><span>Visão geral</span><span className="date-label">Seu assistente de compras</span><span className="avatar">SM</span></header>
        <section className="welcome-row"><div><p className="eyebrow">ORGANIZAÇÃO QUE ECONOMIZA</p><h1>Olá, boas compras <span>✳</span></h1><p className="muted">Sua lista organizada. Seus gastos sob controle.</p></div><button className="primary-button" onClick={() => setShowForm(true)}><Plus size={18}/> Adicionar produto</button></section>

        <section className="hero-card">
          <div className="hero-copy"><span className="hero-kicker"><ShoppingBasket size={14}/> SEU DINHEIRO, BEM CUIDADO</span><h2>Compras inteligentes.<br/>Sem surpresas no caixa.</h2><p>Registre os preços, acompanhe o total<br className="desktop-break"/> e mantenha seu orçamento sob controle.</p><button className="hero-button" onClick={() => setShowForm(true)}><Plus size={17}/> Começar minha lista <ChevronRight size={17}/></button></div>
          <div className="hero-art" aria-hidden="true"><ShoppingBasket size={118} strokeWidth={1.1}/><span className="art-leaf">✳</span></div>
        </section>

        <section className="stats-grid">
          <article className="stat-card"><div className="stat-top"><span>Valor da lista</span><span className="stat-icon green"><Wallet size={18}/></span></div><strong>{formatBRL(totals.cents)}</strong><small><ArrowUpRight size={13}/> Total calculado dos produtos</small></article>
          <article className="stat-card"><div className="stat-top"><span>Produtos adicionados</span><span className="stat-icon blue"><ShoppingBasket size={18}/></span></div><strong>{String(state.items.length).padStart(2, "0")} <em>itens</em></strong><small>{boughtCount} já marcados como comprados</small></article>
          <article className="stat-card"><div className="stat-top"><span>Orçamento disponível</span><span className="stat-icon orange"><Wallet size={18}/></span></div><strong>{state.budget ? formatBRL(Math.max(state.budget * 100 - totals.cents, 0)) : "Definir"}</strong><small>{state.budget ? `Limite de ${formatBRL(state.budget * 100)}` : "Configure seu limite de gastos"}</small></article>
        </section>

        <section className="content-grid">
          <article className="list-panel" id="shopping-list">
            <div className="section-heading"><div><h3>Minha lista de compras</h3><p className="muted">Adicione os produtos e acompanhe os preços.</p></div><button className="text-button" onClick={() => setShowForm(true)}><Plus size={16}/> Novo item</button></div>
            <div className="list-toolbar"><div className="search-box"><Search size={16}/><input aria-label="Pesquisar produtos" placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)}/></div><span className="item-count">{state.items.length} produtos</span></div>
            {visibleItems.length === 0 ? <div className="empty-state"><span className="empty-icon"><ShoppingBasket size={27}/></span><h4>{search ? "Nenhum produto encontrado" : "Sua lista começa aqui"}</h4><p>{search ? "Experimente outro termo." : "Adicione os produtos que você precisa comprar."}</p><button className="outline-button" onClick={() => setShowForm(true)}><Plus size={16}/> Adicionar primeiro produto</button></div> :
              <div className="item-list">{visibleItems.map((item) => <div className={`product-row ${item.checked ? "is-checked" : ""}`} key={item.id}><button className="check-button" aria-label={item.checked ? "Desmarcar comprado" : "Marcar como comprado"} onClick={() => toggleItem(item.id)}>{item.checked && <Check size={15}/>}</button><div className="product-info"><strong>{item.name}</strong><span>{item.category} · {formatItem(item)}</span></div><div className="product-price"><strong>{formatBRL(calculateSubtotal(item.unitPrice, item.quantity, item.measure))}</strong><small>subtotal</small></div><button className="icon-button danger" aria-label={`Excluir ${item.name}`} onClick={() => removeItem(item.id)}><Trash2 size={16}/></button></div>)}</div>}
            <div className="list-footer"><span>{boughtCount} de {state.items.length} produtos comprados</span><strong>{formatBRL(totals.cents)}</strong></div>
          </article>

          <aside className="right-column">
            <article className="budget-panel" id="summary"><div className="section-heading"><div><h3>Meu orçamento</h3><p className="muted">Defina seu limite para esta compra.</p></div><span className="stat-icon green"><Wallet size={18}/></span></div><label className="field-label" htmlFor="budget">Limite em reais</label><div className="budget-input"><span>R$</span><input id="budget" inputMode="decimal" placeholder="Ex.: 500,00" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} onBlur={updateBudget} onKeyDown={(e) => e.key === "Enter" && updateBudget()}/><button onClick={updateBudget} aria-label="Salvar orçamento"><Check size={17}/></button></div><div className="budget-progress"><span style={{width: `${state.budget ? Math.min((totals.cents / (state.budget * 100)) * 100, 100) : 0}%`}}/></div><div className="budget-meta"><span>{state.budget ? `${Math.min((totals.cents / (state.budget * 100)) * 100, 100).toFixed(0)}% utilizado` : "Orçamento não definido"}</span><strong>{state.budget ? formatBRL(totals.remaining) + " restantes" : "—"}</strong></div></article>
            <article className="tip-panel"><div className="tip-icon"><CircleHelp size={18}/></div><div><strong>Dica SmartMarket</strong><p>Confira o preço na etiqueta antes de registrar. Assim seu total fica mais próximo do valor no caixa.</p></div></article>
            <article className="scanner-panel"><div className="scanner-icon"><Camera size={19}/></div><div><strong>Leitura de etiquetas</strong><p>O scanner OCR será ativado na próxima etapa.</p><button className="text-button" onClick={notifyScanner}>Como vai funcionar <ArrowDown size={14}/></button></div></article>
          </aside>
        </section>
        <footer className="footer"><span>SmartMarket · Compras inteligentes</span><span><span className="online-dot"/> Armazenamento neste aparelho</span></footer>
      </main>

      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso"><X size={16}/></button></div>}
      {showForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">SUA LISTA</p><h2 id="modal-title">Adicionar produto</h2></div><button className="icon-button" onClick={() => setShowForm(false)} aria-label="Fechar"><X/></button></div><form onSubmit={addItem}><label>Nome do produto<input autoFocus required placeholder="Ex.: Arroz tipo 1" value={name} onChange={(e) => setName(e.target.value)}/></label><label>Categoria<select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((entry) => <option key={entry}>{entry}</option>)}</select></label><div className="form-two"><label>Unidade de venda<select value={measure} onChange={(e) => setMeasure(e.target.value as Measure)}><option value="un">Unidade</option><option value="kg">Quilograma (kg)</option><option value="g">Grama (g)</option><option value="l">Litro (L)</option><option value="ml">Mililitro (ml)</option></select></label><label>{measure === "un" ? "Quantidade" : "Quantidade (" + measure + ")"}<input required type="number" min="0.001" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)}/></label></div><label>Preço por {measure === "un" ? "unidade" : measure === "kg" || measure === "g" ? "kg" : "litro"} (R$)<input required inputMode="decimal" placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)}/></label><p className="form-hint">Para produtos por grama, informe o preço por kg. Para ml, informe o preço por litro.</p><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" className="primary-button"><Plus size={17}/> Adicionar à lista</button></div></form></section></div>}
    </div>
  );
}

export default App;
