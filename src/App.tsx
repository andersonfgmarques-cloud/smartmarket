import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, CircleHelp, ShoppingBasket, ShoppingCart, SlidersHorizontal, Wallet, X, FileDown, Plus } from "lucide-react";
import { calculateSubtotal, formatBRL, parseBRLAmount } from "./lib/money";
import { createItem, loadState, saveState } from "./lib/storage";
import type { PurchaseRecord, ShoppingState } from "./types";

const initialState: ShoppingState = { items: [], budget: 0, purchases: [] };

function App() {
  const [state, setState] = useState<ShoppingState>(initialState);
  const [ready, setReady] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");
  const [manualMeasure, setManualMeasure] = useState<"un" | "kg" | "g" | "l" | "ml">("un");
  const [notice, setNotice] = useState("");
  const [listModal, setListModal] = useState<"purchased" | "scanned" | null>(null);

  useEffect(() => {
    loadState().then((saved) => { setState(saved); setBudgetInput(saved.budget ? String(saved.budget) : ""); }).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) void saveState(state);
  }, [state, ready]);

  const totals = useMemo(() => {
    const cents = state.items.reduce((sum, item) => sum + calculateSubtotal(item.unitPrice, item.quantity, item.measure), 0);
    const purchased = state.items.filter((item) => item.checked).reduce((sum, item) => sum + calculateSubtotal(item.unitPrice, item.quantity, item.measure), 0);
    return { cents, purchased, remaining: Math.max(state.budget * 100 - purchased, 0) };
  }, [state]);

  const updateBudget = () => {
    const value = parseBRLAmount(budgetInput);
    if (value !== null) setState((current) => ({ ...current, budget: value }));
  };
  const finalizePurchase = () => {
    const purchasedItems = state.items.filter((item) => item.checked);
    if (purchasedItems.length === 0) {
      setNotice("Marque os produtos comprados antes de finalizar a compra.");
      return;
    }
    const record: PurchaseRecord = {
      id: crypto.randomUUID(),
      purchasedAt: new Date().toISOString(),
      items: purchasedItems.map((item) => ({ ...item })),
      totalCents: purchasedItems.reduce((sum, item) => sum + calculateSubtotal(item.unitPrice, item.quantity, item.measure), 0),
    };
    setState((current) => ({
      ...current,
      items: current.items.filter((item) => !item.checked),
      purchases: [record, ...(current.purchases ?? [])],
    }));
    setNotice("Compra registrada no histórico.");
  };

  const addManualItem = () => {
    const name = manualName.trim();
    const price = parseBRLAmount(manualPrice);
    const quantity = Number(manualQuantity.replace(",", "."));
    if (!name) { setNotice("Informe o nome do produto."); return; }
    if (price === null || price <= 0) { setNotice("Informe um preço válido maior que zero."); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { setNotice("Informe uma quantidade válida."); return; }
    const kind = manualMeasure === "kg" || manualMeasure === "g" ? "weight" : manualMeasure === "l" || manualMeasure === "ml" ? "volume" : "unit";
    const item = createItem({ name, category: "Outros", kind, measure: manualMeasure, quantity, unitPrice: price });
    setState((current) => ({ ...current, items: [{ ...item, checked: true }, ...current.items] }));
    setManualName("");
    setManualPrice("");
    setManualQuantity("1");
    setManualMeasure("un");
    setShowManualForm(false);
    setNotice(name + " adicionado à lista.");
  };

  const clearShoppingList = () => {
    if (state.items.length === 0) {
      setNotice("A lista já está vazia.");
      return;
    }
    const confirmed = window.confirm("Apagar todos os produtos da lista? Essa ação não apaga o orçamento nem o histórico de compras.");
    if (!confirmed) return;
    setState((current) => ({ ...current, items: [] }));
    setListModal(null);
    setNotice("Lista apagada. O orçamento e o histórico foram mantidos.");
  };

  const boughtCount = state.items.filter((item) => item.checked).length;
  const modalItems = listModal === "purchased" ? state.items.filter((item) => item.checked) : state.items;

  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);

  const exportListPdf = () => {
    if (!listModal) return;
    const title = listModal === "purchased" ? "Itens comprados" : "Produtos na lista";
    const items = modalItems;
    const totalCents = items.reduce((sum, item) => sum + calculateSubtotal(item.unitPrice, item.quantity, item.measure), 0);
    const rows = items.map((item) => {
      const subtotal = calculateSubtotal(item.unitPrice, item.quantity, item.measure);
      return `<tr><td>${escapeHtml(item.name)}</td><td>${item.quantity.toLocaleString("pt-BR")} ${escapeHtml(item.measure)}</td><td>${formatBRL(Math.round(item.unitPrice * 100))}</td><td>${formatBRL(subtotal)}</td></tr>`;
    }).join("");
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setNotice("O navegador bloqueou a janela do PDF. Permita pop-ups para o SmartMarket e tente novamente.");
      return;
    }
    printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - SmartMarket</title><style>
      body{font-family:Arial,sans-serif;color:#1f2d25;margin:28px}h1{font-size:22px;margin:0 0 6px;color:#087443}.sub{color:#65736a;font-size:12px;margin-bottom:22px}.brand{font-weight:bold;color:#087443;margin-bottom:26px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px 8px;border-bottom:1px solid #dce6df;text-align:left}th{background:#edf6f0;color:#315b43}.total{margin-top:18px;text-align:right;font-size:16px;font-weight:bold}.foot{margin-top:30px;color:#89948d;font-size:10px}@media print{body{margin:14mm}}
      </style></head><body><div class="brand">SmartMarket</div><h1>${title}</h1><div class="sub">Gerado em ${new Date().toLocaleString("pt-BR")} · ${items.length} produto(s)</div><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Preço unitário</th><th>Subtotal</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Nenhum produto nesta lista.</td></tr>'}</tbody></table><div class="total">Total: ${formatBRL(totalCents)}</div><div class="foot">Documento gerado pelo SmartMarket.</div><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

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
        <section className="welcome-row"><div><p className="eyebrow">LISTA MANUAL DE COMPRAS</p><h1>Olá, boas compras <span>✳</span></h1><p className="muted">Adicione os produtos, informe os preços e acompanhe seu orçamento.</p></div><button className="primary-button" onClick={() => setShowManualForm(true)}><Plus size={18}/> Adicionar produto</button></section>

        <section className="hero-card">
          <div className="hero-copy"><span className="hero-kicker"><ShoppingBasket size={14}/> SEU DINHEIRO, BEM CUIDADO</span><h2>Compras inteligentes.<br/>Sem surpresas no caixa.</h2><p>Registre os preços, acompanhe o total<br className="desktop-break"/> e mantenha seu orçamento sob controle.</p><button className="hero-button" onClick={() => setShowManualForm(true)}><Plus size={17}/> Adicionar primeiro produto <ChevronRight size={17}/></button></div>
          <div className="hero-art" aria-hidden="true"><ShoppingBasket size={118} strokeWidth={1.1}/><span className="art-leaf">✳</span></div>
        </section>

        <section className="stats-grid">
          <button type="button" className="stat-card stat-card-button" onClick={() => setListModal("purchased")} aria-label="Abrir lista de itens comprados"><div className="stat-top"><span>Total comprado</span><span className="stat-icon green"><Wallet size={18}/></span></div><strong>{formatBRL(totals.purchased)}</strong><small><ArrowUpRight size={13}/> {boughtCount} itens comprados · Ver lista</small></button>
          <button type="button" className="stat-card stat-card-button" onClick={() => setListModal("scanned")} aria-label="Abrir lista de produtos"><div className="stat-top"><span>Produtos na lista</span><span className="stat-icon blue"><ShoppingBasket size={18}/></span></div><strong>{String(state.items.length).padStart(2, "0")} <em>itens</em></strong><small>Adicionados manualmente · Ver lista</small></button>
          <article className="stat-card"><div className="stat-top"><span>Orçamento disponível</span><span className="stat-icon orange"><Wallet size={18}/></span></div><strong className={state.budget && totals.purchased > state.budget * 100 ? "budget-overrun-text" : ""}>{state.budget ? (totals.purchased > state.budget * 100 ? formatBRL(totals.purchased - state.budget * 100) + " excedidos" : formatBRL(state.budget * 100 - totals.purchased)) : "Definir"}</strong><small>{state.budget ? `Limite de ${formatBRL(state.budget * 100)}` : "Configure seu limite de gastos"}</small></article>
        </section>

        <section className="content-grid">
          <article className="list-panel" id="shopping-list">
            <div className="section-heading"><div><h3>Produtos desta compra</h3><p className="muted">Adicione manualmente cada produto, preço e quantidade.</p></div><button className="text-button" onClick={() => setShowManualForm(true)}><Plus size={16}/> Adicionar produto</button></div>
            <div className="list-toolbar"><span className="item-count">{state.items.length} produtos registrados</span></div>
            {state.items.length === 0 ? <div className="empty-state"><span className="empty-icon"><ShoppingBasket size={27}/></span><h4>Sua lista está vazia</h4><p>Adicione manualmente o primeiro produto, informando preço e quantidade.</p><button className="outline-button" onClick={() => setShowManualForm(true)}><Plus size={16}/> Adicionar produto</button></div> : <div className="item-list">{state.items.map((item) => <div className="product-row is-checked" key={item.id}><div className="product-info"><strong>{item.name}</strong><span>{item.quantity.toLocaleString("pt-BR")} {item.measure === "un" ? "un." : item.measure} × {formatBRL(Math.round(item.unitPrice * 100))}</span></div><div className="product-price"><strong>{formatBRL(calculateSubtotal(item.unitPrice, item.quantity, item.measure))}</strong><small>subtotal</small></div></div>)}</div>}
            <div className="list-footer"><span>{boughtCount} de {state.items.length} produtos comprados</span><strong>{formatBRL(totals.cents)}</strong></div><button className="outline-button" disabled={boughtCount === 0} onClick={finalizePurchase}>Finalizar compra ({boughtCount})</button>
          </article>

          <aside className="right-column">
            <article className="budget-panel" id="summary"><div className="section-heading"><div><h3>Meu orçamento</h3><p className="muted">Defina seu limite para esta compra.</p></div><span className="stat-icon green"><Wallet size={18}/></span></div><label className="field-label" htmlFor="budget">Limite em reais</label><div className="budget-input"><span>R$</span><input id="budget" inputMode="decimal" placeholder="Ex.: 500,00" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} onBlur={updateBudget} onKeyDown={(e) => e.key === "Enter" && updateBudget()}/><button onClick={updateBudget} aria-label="Salvar orçamento"><Check size={17}/></button></div><div className="budget-progress"><span style={{width: `${state.budget ? Math.min((totals.purchased / (state.budget * 100)) * 100, 100) : 0}%`}}/></div><div className="budget-meta"><span>{state.budget ? `${((totals.purchased / (state.budget * 100)) * 100).toFixed(0)}% utilizado` : "Orçamento não definido"}</span><strong className={state.budget && totals.purchased > state.budget * 100 ? "budget-overrun-text" : ""}>{state.budget ? (totals.purchased > state.budget * 100 ? "Orçamento excedido" : formatBRL(state.budget * 100 - totals.purchased) + " restantes") : "—"}</strong></div>{state.budget > 0 && totals.purchased > state.budget * 100 && <div className="budget-overrun" role="status"><strong>Orçamento ultrapassado!</strong><span>Você passou {formatBRL(totals.purchased - state.budget * 100)} do limite definido.</span></div>}</article>
            <article className="tip-panel"><div className="tip-icon"><CircleHelp size={18}/></div><div><strong>Dica SmartMarket</strong><p>Confira o preço na etiqueta antes de registrar. Assim seu total fica mais próximo do valor no caixa.</p></div></article>
            <article className="tip-panel"><div className="tip-icon"><Plus size={18}/></div><div><strong>Lista manual</strong><p>Informe o nome, o preço e a quantidade de cada produto. O total é atualizado automaticamente.</p></div></article>
          </aside>
        </section>
        <section className="list-panel purchase-history" id="purchase-history">
          <div className="section-heading">
            <div><h3>Histórico de compras</h3><p className="muted">Compras finalizadas neste aparelho.</p></div>
            <span className="item-count">{(state.purchases ?? []).length} registros</span>
          </div>
          {(state.purchases ?? []).length === 0
            ? <p className="muted">Suas compras finalizadas aparecerão aqui.</p>
            : <div className="history-list">{(state.purchases ?? []).map((purchase) => (
              <article className="history-row" key={purchase.id}>
                <div><strong>{new Date(purchase.purchasedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</strong><small>{purchase.items.length} produtos</small></div>
                <strong>{formatBRL(purchase.totalCents)}</strong>
              </article>
            ))}</div>}
        </section>
        <footer className="footer"><span>SmartMarket · Compras inteligentes</span><span><span className="online-dot"/> Armazenamento neste aparelho</span></footer>
      </main>

      {listModal && <div className="modal-backdrop list-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setListModal(null); }}><section className="modal list-modal" role="dialog" aria-modal="true" aria-labelledby="list-modal-title"><div className="modal-heading"><div><p className="eyebrow">SMARTMARKET · SUA COMPRA</p><h2 id="list-modal-title">{listModal === "purchased" ? "Itens comprados" : "Produtos da lista"}</h2><p className="muted">{modalItems.length} produto(s) na lista</p></div><button className="icon-button" onClick={() => setListModal(null)} aria-label="Fechar lista"><X/></button></div>{modalItems.length === 0 ? <div className="empty-state"><h4>Nenhum item nesta lista</h4><p>Os produtos aparecerão aqui após serem registrados.</p></div> : <div className="list-modal-items">{modalItems.map((item) => <div className="product-row" key={item.id}><div className="product-info"><strong>{item.name}</strong><span>{item.quantity.toLocaleString("pt-BR")} {item.measure} × {formatBRL(Math.round(item.unitPrice * 100))}</span></div><div className="product-price"><strong>{formatBRL(calculateSubtotal(item.unitPrice, item.quantity, item.measure))}</strong><small>subtotal</small></div></div>)}</div>}<div className="list-modal-total"><span>Total da lista</span><strong>{formatBRL(modalItems.reduce((sum, item) => sum + calculateSubtotal(item.unitPrice, item.quantity, item.measure), 0))}</strong></div><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setListModal(null)}>Fechar</button><button type="button" className="outline-button danger-button" onClick={clearShoppingList} disabled={state.items.length === 0}>Apagar lista</button><button type="button" className="primary-button" onClick={exportListPdf}><FileDown size={17}/> Gerar PDF</button></div></section></div>}
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso"><X size={16}/></button></div>}
      {showManualForm && <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setShowManualForm(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="manual-item-title"><div className="modal-heading"><div><p className="eyebrow">SMARTMARKET · LISTA MANUAL</p><h2 id="manual-item-title">Adicionar produto</h2></div><button className="icon-button" onClick={() => setShowManualForm(false)} aria-label="Fechar formulário"><X/></button></div><form onSubmit={(event) => { event.preventDefault(); addManualItem(); }}><label>Nome do produto<input autoFocus value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Ex.: Arroz 5 kg" required/></label><div className="form-two"><label>Preço (R$)<input inputMode="decimal" value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} placeholder="Ex.: 29,90" required/></label><label>Quantidade<input type="number" min="0.001" step="any" inputMode="decimal" value={manualQuantity} onChange={(event) => setManualQuantity(event.target.value)} required/></label></div><label>Unidade de medida<select value={manualMeasure} onChange={(event) => setManualMeasure(event.target.value as "un" | "kg" | "g" | "l" | "ml")}><option value="un">Unidade</option><option value="kg">Quilograma (kg)</option><option value="g">Grama (g)</option><option value="l">Litro (L)</option><option value="ml">Mililitro (ml)</option></select></label><p className="form-hint">O subtotal será calculado automaticamente e somado ao total da compra.</p><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowManualForm(false)}>Cancelar</button><button type="submit" className="primary-button"><Plus size={17}/> Adicionar à lista</button></div></form></section></div>}

    </div>
  );
}

export default App;
