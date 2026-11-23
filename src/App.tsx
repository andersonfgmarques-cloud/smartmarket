import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Camera, Check, ChevronRight, CircleHelp, Clock3, Pencil, Plus, Search, ShoppingBasket, ShoppingCart, SlidersHorizontal, Star, Trash2, Wallet, X, ScanLine } from "lucide-react";
import { calculateSubtotal, formatBRL, parseBRLAmount } from "./lib/money";
import { createItem, loadState, saveState } from "./lib/storage";
import type { Measure, PurchaseRecord, ShoppingItem, ShoppingState } from "./types";

const initialState: ShoppingState = { items: [], budget: 0, purchases: [] };
const categories = ["Mercearia", "Hortifruti", "Carnes", "Laticínios", "Bebidas", "Limpeza", "Higiene", "Outros"];

function App() {
  const [state, setState] = useState<ShoppingState>(initialState);
  const [ready, setReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Mercearia");
  const [measure, setMeasure] = useState<Measure>("un");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [budgetInput, setBudgetInput] = useState("");
  const [search, setSearch] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [notice, setNotice] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [scanResult, setScanResult] = useState<{ name: string; price: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  const visibleItems = state.items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()) && (!showFavorites || item.favorite));
  const openAddForm = () => {
    setEditingId(null);
    setName("");
    setCategory("Mercearia");
    setMeasure("un");
    setQuantity("1");
    setPrice("");
    setShowForm(true);
  };
  const openEditForm = (item: ShoppingItem) => {
    setEditingId(item.id);
    setName(item.name);
    setCategory(item.category);
    setMeasure(item.measure);
    setQuantity(String(item.quantity));
    setPrice(String(item.unitPrice).replace(".", ","));
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); };
  const addItem = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedPrice = parseBRLAmount(price);
    const parsedQuantity = Number(quantity.replace(",", "."));
    if (!name.trim() || (price.trim() !== "" && parsedPrice === null) || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    const savedPrice = parsedPrice ?? 0;
    const kind = measure === "un" ? "unit" : measure === "l" || measure === "ml" ? "volume" : "weight";
    if (editingId) {
      setState((current) => ({
        ...current,
        items: current.items.map((item) => item.id === editingId
          ? { ...item, name: name.trim(), category, kind, measure, quantity: parsedQuantity, unitPrice: savedPrice, updatedAt: new Date().toISOString() }
          : item),
      }));
    } else {
      const item = createItem({ name: name.trim(), category, kind, measure, quantity: parsedQuantity, unitPrice: savedPrice });
      setState((current) => ({ ...current, items: [item, ...current.items] }));
    }
    closeForm();
  };
  const updateBudget = () => {
    const value = parseBRLAmount(budgetInput);
    if (value !== null) setState((current) => ({ ...current, budget: value }));
  };
  const toggleItem = (id: string) => setState((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, checked: !item.checked } : item) }));
  const removeItem = (id: string) => setState((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }));
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
  const toggleFavorite = (id: string) => setState((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item) }));
  const formatItem = (item: ShoppingItem) => {
    const unit = item.measure === "un" ? "un." : item.measure;
    return `${item.quantity.toLocaleString("pt-BR")} ${unit} × ${formatBRL(Math.round(item.unitPrice * 100))}`;
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };
  const openScanner = () => {
    setScanResult(null);
    setOcrProgress(0);
    setShowScanner(true);
  };
  useEffect(() => {
    if (!showScanner) return;
    let cancelled = false;
    let activeStream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("A câmera exige HTTPS e um navegador compatível. Abra o SmartMarket pelo Chrome ou Safari.");
        activeStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          activeStream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = activeStream;
        if (videoRef.current) {
          videoRef.current.srcObject = activeStream;
          await videoRef.current.play();
          if (!cancelled) setCameraReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : "Não foi possível abrir a câmera. Autorize o acesso nas configurações do navegador.");
          setShowScanner(false);
        }
      }
    };
    void startCamera();
    return () => {
      cancelled = true;
      activeStream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === activeStream) streamRef.current = null;
    };
  }, [showScanner]);

  useEffect(() => {
    if (!showScanner || !cameraReady || scanResult) return;
    let cancelled = false;
    let terminateWorker: (() => Promise<unknown>) | undefined;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const scanContinuously = async () => {
      setScanning(true);
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("por+eng", 1);
        terminateWorker = () => worker.terminate();
        while (!cancelled && videoRef.current && !scanResult) {
          const video = videoRef.current;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            const canvas = document.createElement("canvas");
            const scale = Math.min(1.5, 1800 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            const context = canvas.getContext("2d");
            if (context) {
              context.filter = "contrast(1.35) brightness(1.08)";
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const result = await (await import("tesseract.js")).createWorker === undefined ? Promise.resolve({ data: { text: "" } }) : worker.recognize(canvas);
              if (cancelled) break;
              const recognized = result.data.text;
              const normalized = recognized.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
              const priceMatches = [...normalized.matchAll(/(?:R\s*\$\s*)?(\d{1,4}(?:[. ]\d{3})*[,.]\d{2})/gi)];
              const candidates = priceMatches.map((match) => {
                const value = match[1].replace(/ /g, "").replace(/\.(?=\d{3}(?:[,.]|$))/g, "").replace(",", ".");
                return parseBRLAmount(value);
              }).filter((value): value is number => value !== null && value > 0 && value < 100000);
              if (candidates.length > 0) {
                const lines = recognized.split(/\r?\n/).map((line) => line.replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim())
                  .filter((line) => line.length >= 3 && !/^(R\$|pre[cç]o|oferta|por|kg|un|cada|unidade)/i.test(line) && !/\d+[,.]\d{2}/.test(line));
                const productName = lines.sort((a, b) => b.length - a.length)[0] ?? "";
                setScanResult({ name: productName, price: candidates[0] });
                setOcrProgress(100);
                break;
              }
              setOcrProgress((current) => current >= 90 ? 10 : current + 10);
            }
          }
          await wait(1100);
        }
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Falha ao iniciar a leitura automática.");
      } finally {
        await terminateWorker?.();
        if (!cancelled) setScanning(false);
      }
    };
    void scanContinuously();
    return () => { cancelled = true; };
  }, [showScanner, cameraReady, scanResult]);
  const closeScanner = () => {
    stopCamera();
    setShowScanner(false);
    setScanning(false);
    setScanResult(null);
  };
  const confirmScan = () => {
    if (!scanResult) return;
    const cleanName = scanResult.name.trim();
    if (!cleanName) {
      setNotice("O preço foi identificado, mas o nome não. Tente novamente enquadrando toda a etiqueta.");
      return;
    }
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = state.items.find((item) => normalize(item.name).includes(normalize(cleanName)) || normalize(cleanName).includes(normalize(item.name)));
    const now = new Date().toISOString();
    if (match) {
      setState((current) => ({ ...current, items: current.items.map((item) => item.id === match.id ? { ...item, unitPrice: scanResult.price, checked: true, updatedAt: now } : item) }));
      setNotice(match.name + ": " + formatBRL(Math.round(scanResult.price * 100)) + " registrado.");
    } else {
      const detected = createItem({ name: cleanName, category: "Outros", kind: "unit", measure: "un", quantity: 1, unitPrice: scanResult.price });
      setState((current) => ({ ...current, items: [{ ...detected, checked: true }, ...current.items] }));
      setNotice(cleanName + " foi adicionado à lista como comprado.");
    }
    closeScanner();
  };

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
        <section className="welcome-row"><div><p className="eyebrow">ORGANIZAÇÃO QUE ECONOMIZA</p><h1>Olá, boas compras <span>✳</span></h1><p className="muted">Sua lista organizada. Seus gastos sob controle.</p></div><button className="primary-button" onClick={openAddForm}><Plus size={18}/> Adicionar produto</button></section>

        <section className="hero-card">
          <div className="hero-copy"><span className="hero-kicker"><ShoppingBasket size={14}/> SEU DINHEIRO, BEM CUIDADO</span><h2>Compras inteligentes.<br/>Sem surpresas no caixa.</h2><p>Registre os preços, acompanhe o total<br className="desktop-break"/> e mantenha seu orçamento sob controle.</p><button className="hero-button" onClick={openAddForm}><Plus size={17}/> Começar minha lista <ChevronRight size={17}/></button></div>
          <div className="hero-art" aria-hidden="true"><ShoppingBasket size={118} strokeWidth={1.1}/><span className="art-leaf">✳</span></div>
        </section>

        <section className="stats-grid">
          <article className="stat-card"><div className="stat-top"><span>Valor da lista</span><span className="stat-icon green"><Wallet size={18}/></span></div><strong>{formatBRL(totals.cents)}</strong><small><ArrowUpRight size={13}/> Total calculado dos produtos</small></article>
          <article className="stat-card"><div className="stat-top"><span>Produtos adicionados</span><span className="stat-icon blue"><ShoppingBasket size={18}/></span></div><strong>{String(state.items.length).padStart(2, "0")} <em>itens</em></strong><small>{boughtCount} já marcados como comprados</small></article>
          <article className="stat-card"><div className="stat-top"><span>Orçamento disponível</span><span className="stat-icon orange"><Wallet size={18}/></span></div><strong>{state.budget ? formatBRL(Math.max(state.budget * 100 - totals.cents, 0)) : "Definir"}</strong><small>{state.budget ? `Limite de ${formatBRL(state.budget * 100)}` : "Configure seu limite de gastos"}</small></article>
        </section>

        <section className="content-grid">
          <article className="list-panel" id="shopping-list">
            <div className="section-heading"><div><h3>Minha lista de compras</h3><p className="muted">Adicione os produtos e acompanhe os preços.</p></div><button className="text-button" onClick={openAddForm}><Plus size={16}/> Novo item</button></div>
            <div className="list-toolbar"><div className="search-box"><Search size={16}/><input aria-label="Pesquisar produtos" placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)}/></div><div className="list-tools"><button className={`text-button ${showFavorites ? "selected" : ""}`} onClick={() => setShowFavorites((value) => !value)}><Star size={14}/> Favoritos</button><span className="item-count">{visibleItems.length} produtos</span></div></div>
            {visibleItems.length === 0 ? <div className="empty-state"><span className="empty-icon"><ShoppingBasket size={27}/></span><h4>{search ? "Nenhum produto encontrado" : "Sua lista começa aqui"}</h4><p>{search ? "Experimente outro termo." : "Adicione os produtos que você precisa comprar."}</p><button className="outline-button" onClick={openAddForm}><Plus size={16}/> Adicionar primeiro produto</button></div> :
              <div className="item-list">{visibleItems.map((item) => <div className={`product-row ${item.checked ? "is-checked" : ""}`} key={item.id}><button className="check-button" aria-label={item.checked ? "Desmarcar comprado" : "Marcar como comprado"} onClick={() => toggleItem(item.id)}>{item.checked && <Check size={15}/>}</button><div className="product-info"><strong>{item.name}</strong><span>{item.category} · {formatItem(item)}</span></div><div className="product-price"><strong>{formatBRL(calculateSubtotal(item.unitPrice, item.quantity, item.measure))}</strong><small>subtotal</small></div><button className={`icon-button favorite-button ${item.favorite ? "is-favorite" : ""}`} aria-label={item.favorite ? `Remover ${item.name} dos favoritos` : `Adicionar ${item.name} aos favoritos`} onClick={() => toggleFavorite(item.id)}><Star size={15} fill={item.favorite ? "currentColor" : "none"}/></button><button className="icon-button" aria-label={`Editar ${item.name}`} onClick={() => openEditForm(item)}><Pencil size={15}/></button><button className="icon-button danger" aria-label={`Excluir ${item.name}`} onClick={() => removeItem(item.id)}><Trash2 size={16}/></button></div>)}</div>}
            <div className="list-footer"><span>{boughtCount} de {state.items.length} produtos comprados</span><strong>{formatBRL(totals.cents)}</strong></div><button className="outline-button" disabled={boughtCount === 0} onClick={finalizePurchase}>Finalizar compra ({boughtCount})</button>
          </article>

          <aside className="right-column">
            <article className="budget-panel" id="summary"><div className="section-heading"><div><h3>Meu orçamento</h3><p className="muted">Defina seu limite para esta compra.</p></div><span className="stat-icon green"><Wallet size={18}/></span></div><label className="field-label" htmlFor="budget">Limite em reais</label><div className="budget-input"><span>R$</span><input id="budget" inputMode="decimal" placeholder="Ex.: 500,00" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} onBlur={updateBudget} onKeyDown={(e) => e.key === "Enter" && updateBudget()}/><button onClick={updateBudget} aria-label="Salvar orçamento"><Check size={17}/></button></div><div className="budget-progress"><span style={{width: `${state.budget ? Math.min((totals.purchased / (state.budget * 100)) * 100, 100) : 0}%`}}/></div><div className="budget-meta"><span>{state.budget ? `${Math.min((totals.purchased / (state.budget * 100)) * 100, 100).toFixed(0)}% utilizado` : "Orçamento não definido"}</span><strong>{state.budget ? formatBRL(totals.remaining) + " restantes" : "—"}</strong></div></article>
            <article className="tip-panel"><div className="tip-icon"><CircleHelp size={18}/></div><div><strong>Dica SmartMarket</strong><p>Confira o preço na etiqueta antes de registrar. Assim seu total fica mais próximo do valor no caixa.</p></div></article>
            <article className="scanner-panel"><div className="scanner-icon"><Camera size={19}/></div><div><strong>Leitura de etiquetas</strong><p>Leia o preço na prateleira com a câmera do celular.</p><button className="text-button" onClick={openScanner}><ScanLine size={14}/> Abrir leitor de preços</button></div></article>
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

      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso"><X size={16}/></button></div>}
      {showScanner && <div className="modal-backdrop scanner-backdrop"><section className="modal scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><div className="modal-heading"><div><p className="eyebrow">COMPRA EM TEMPO REAL</p><h2 id="scanner-title">Ler etiqueta de preço</h2></div><button className="icon-button" onClick={closeScanner} aria-label="Fechar leitor"><X/></button></div><video ref={videoRef} className="scanner-video" playsInline muted/><p className="form-hint">{cameraReady ? (scanResult ? "Etiqueta identificada automaticamente. Confira os dados antes de confirmar." : "Leitura automática ativa. Aponte para a etiqueta do produto e mantenha o preço visível.") : "Iniciando câmera traseira..."}</p><div className="scanner-status">{scanResult ? "Etiqueta detectada" : scanning ? "Procurando preço na imagem..." : "Preparando leitura automática..."}</div><p className="form-hint">Enquadre a etiqueta do mercado inteira. Evite apontar para o chão, pessoas ou embalagens sem a etiqueta de preço.</p>{scanResult && <div className="scan-result"><strong>Leitura identificada</strong><span>{scanResult.name || "Nome não identificado"}</span><b>{formatBRL(Math.round(scanResult.price * 100))}</b><small>Confira o resultado antes de registrar.</small></div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={closeScanner}>Cancelar</button>{scanResult ? <button type="button" className="primary-button" onClick={confirmScan}><Check size={17}/> Confirmar compra</button> : <button type="button" className="primary-button" disabled><Camera size={17}/>{scanning ? "Leitura automática ativa" : "Aguardando câmera"}</button>}</div></section></div>}
      {showForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">SUA LISTA</p><h2 id="modal-title">{editingId ? "Editar produto" : "Adicionar produto"}</h2></div><button className="icon-button" onClick={closeForm} aria-label="Fechar"><X/></button></div><form onSubmit={addItem}><label>Nome do produto<input autoFocus required placeholder="Ex.: Arroz tipo 1" value={name} onChange={(e) => setName(e.target.value)}/></label><label>Categoria<select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((entry) => <option key={entry}>{entry}</option>)}</select></label><div className="form-two"><label>Unidade de venda<select value={measure} onChange={(e) => setMeasure(e.target.value as Measure)}><option value="un">Unidade</option><option value="kg">Quilograma (kg)</option><option value="g">Grama (g)</option><option value="l">Litro (L)</option><option value="ml">Mililitro (ml)</option></select></label><label>{measure === "un" ? "Quantidade" : "Quantidade (" + measure + ")"}<input required type="number" min="0.001" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)}/></label></div><p className="form-hint">O preço será identificado pela câmera durante a compra. Você pode deixar o preço em branco.</p><div className="modal-actions"><button type="button" className="outline-button" onClick={closeForm}>Cancelar</button><button type="submit" className="primary-button">{editingId ? <Check size={17}/> : <Plus size={17}/>} {editingId ? "Salvar alterações" : "Adicionar à lista"}</button></div></form></section></div>}
    </div>
  );
}

export default App;
