import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Camera, Check, ChevronRight, CircleHelp, Clock3, ShoppingBasket, ShoppingCart, SlidersHorizontal, Wallet, X, ScanLine } from "lucide-react";
import { calculateSubtotal, formatBRL, parseBRLAmount } from "./lib/money";
import { createItem, loadState, saveState } from "./lib/storage";
import type { PurchaseRecord, ShoppingItem, ShoppingState } from "./types";

const initialState: ShoppingState = { items: [], budget: 0, purchases: [] };

function App() {
  const [state, setState] = useState<ShoppingState>(initialState);
  const [ready, setReady] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [notice, setNotice] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanResult, setScanResult] = useState<{ name: string; price: number } | null>(null);
  const [scanQuantity, setScanQuantity] = useState("1");
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

  const updateBudget = () => {
    const value = parseBRLAmount(budgetInput);
    if (value !== null) setState((current) => ({ ...current, budget: value }));
  };
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

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };
  const openScanner = () => {
    setScanResult(null);
    setScanQuantity("1");
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
              const result = await worker.recognize(canvas);
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
                break;
              }
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
    const parsedQuantity = Number(scanQuantity.replace(",", "."));
    if (!cleanName) { setNotice("Informe o nome do produto antes de adicionar à compra."); return; }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) { setNotice("Informe uma quantidade válida."); return; }
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedName = normalize(cleanName);
    const match = state.items.find((item) => normalize(item.name) === normalizedName);
    const now = new Date().toISOString();
    if (match) {
      setState((current) => ({ ...current, items: current.items.map((item) => item.id === match.id ? { ...item, unitPrice: scanResult.price, quantity: item.quantity + parsedQuantity, checked: true, updatedAt: now } : item) }));
      setNotice(match.name + ": +" + parsedQuantity.toLocaleString("pt-BR") + " un. · " + formatBRL(Math.round(scanResult.price * parsedQuantity * 100)) + " adicionados.");
    } else {
      const detected = createItem({ name: cleanName, category: "Outros", kind: "unit", measure: "un", quantity: parsedQuantity, unitPrice: scanResult.price });
      setState((current) => ({ ...current, items: [{ ...detected, checked: true }, ...current.items] }));
      setNotice(cleanName + " · " + parsedQuantity.toLocaleString("pt-BR") + " un. · " + formatBRL(Math.round(scanResult.price * parsedQuantity * 100)) + " adicionados à compra.");
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
        <section className="welcome-row"><div><p className="eyebrow">COMPRA DIRETO PELO LEITOR</p><h1>Olá, boas compras <span>✳</span></h1><p className="muted">Escaneie o produto, leia o preço e informe a quantidade.</p></div><button className="primary-button" onClick={openScanner}><ScanLine size={18}/> Escanear produto</button></section>

        <section className="hero-card">
          <div className="hero-copy"><span className="hero-kicker"><ShoppingBasket size={14}/> SEU DINHEIRO, BEM CUIDADO</span><h2>Compras inteligentes.<br/>Sem surpresas no caixa.</h2><p>Registre os preços, acompanhe o total<br className="desktop-break"/> e mantenha seu orçamento sob controle.</p><button className="hero-button" onClick={openScanner}><ScanLine size={17}/> Escanear primeiro produto <ChevronRight size={17}/></button></div>
          <div className="hero-art" aria-hidden="true"><ShoppingBasket size={118} strokeWidth={1.1}/><span className="art-leaf">✳</span></div>
        </section>

        <section className="stats-grid">
          <article className="stat-card"><div className="stat-top"><span>Total comprado</span><span className="stat-icon green"><Wallet size={18}/></span></div><strong>{formatBRL(totals.cents)}</strong><small><ArrowUpRight size={13}/> Total calculado dos produtos</small></article>
          <article className="stat-card"><div className="stat-top"><span>Produtos escaneados</span><span className="stat-icon blue"><ShoppingBasket size={18}/></span></div><strong>{String(state.items.length).padStart(2, "0")} <em>itens</em></strong><small>Registrados durante esta compra</small></article>
          <article className="stat-card"><div className="stat-top"><span>Orçamento disponível</span><span className="stat-icon orange"><Wallet size={18}/></span></div><strong>{state.budget ? formatBRL(totals.remaining) : "Definir"}</strong><small>{state.budget ? `Limite de ${formatBRL(state.budget * 100)}` : "Configure seu limite de gastos"}</small></article>
        </section>

        <section className="content-grid">
          <article className="list-panel" id="shopping-list">
            <div className="section-heading"><div><h3>Produtos desta compra</h3><p className="muted">Os produtos aparecem aqui após a leitura pela câmera.</p></div><button className="text-button" onClick={openScanner}><ScanLine size={16}/> Escanear outro</button></div>
            <div className="list-toolbar"><span className="item-count">{state.items.length} produtos registrados</span></div>
            {state.items.length === 0 ? <div className="empty-state"><span className="empty-icon"><Camera size={27}/></span><h4>Nenhum produto escaneado</h4><p>Toque em “Escanear produto” para iniciar sua compra pela câmera.</p><button className="outline-button" onClick={openScanner}><ScanLine size={16}/> Abrir leitor</button></div> : <div className="item-list">{state.items.map((item) => <div className="product-row is-checked" key={item.id}><div className="product-info"><strong>{item.name}</strong><span>{item.quantity.toLocaleString("pt-BR")} {item.measure === "un" ? "un." : item.measure} × {formatBRL(Math.round(item.unitPrice * 100))}</span></div><div className="product-price"><strong>{formatBRL(calculateSubtotal(item.unitPrice, item.quantity, item.measure))}</strong><small>subtotal</small></div></div>)}</div>}
            <div className="list-footer"><span>{boughtCount} de {state.items.length} produtos comprados</span><strong>{formatBRL(totals.cents)}</strong></div><button className="outline-button" disabled={boughtCount === 0} onClick={finalizePurchase}>Finalizar compra ({boughtCount})</button>
          </article>

          <aside className="right-column">
            <article className="budget-panel" id="summary"><div className="section-heading"><div><h3>Meu orçamento</h3><p className="muted">Defina seu limite para esta compra.</p></div><span className="stat-icon green"><Wallet size={18}/></span></div><label className="field-label" htmlFor="budget">Limite em reais</label><div className="budget-input"><span>R$</span><input id="budget" inputMode="decimal" placeholder="Ex.: 500,00" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} onBlur={updateBudget} onKeyDown={(e) => e.key === "Enter" && updateBudget()}/><button onClick={updateBudget} aria-label="Salvar orçamento"><Check size={17}/></button></div><div className="budget-progress"><span style={{width: `${state.budget ? Math.min((totals.purchased / (state.budget * 100)) * 100, 100) : 0}%`}}/></div><div className="budget-meta"><span>{state.budget ? `${Math.min((totals.purchased / (state.budget * 100)) * 100, 100).toFixed(0)}% utilizado` : "Orçamento não definido"}</span><strong>{state.budget ? formatBRL(totals.remaining) + " restantes" : "—"}</strong></div></article>
            <article className="tip-panel"><div className="tip-icon"><CircleHelp size={18}/></div><div><strong>Dica SmartMarket</strong><p>Confira o preço na etiqueta antes de registrar. Assim seu total fica mais próximo do valor no caixa.</p></div></article>
            <article className="scanner-panel"><div className="scanner-icon"><Camera size={19}/></div><div><strong>Leitor de produtos</strong><p>Leia o código de barras da embalagem e depois a etiqueta da prateleira.</p><button className="text-button" onClick={openScanner}><ScanLine size={14}/> Abrir leitor</button></div></article>
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
      {showScanner && <div className="modal-backdrop scanner-backdrop"><section className="modal scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><div className="modal-heading"><div><p className="eyebrow">COMPRA EM TEMPO REAL</p><h2 id="scanner-title">Ler etiqueta de preço</h2></div><button className="icon-button" onClick={closeScanner} aria-label="Fechar leitor"><X/></button></div><video ref={videoRef} className="scanner-video" playsInline muted/><p className="form-hint">{cameraReady ? (scanResult ? "Etiqueta identificada automaticamente. Confira os dados antes de confirmar." : "Leitura automática ativa. Aponte para a etiqueta do produto e mantenha o preço visível.") : "Iniciando câmera traseira..."}</p><div className="scanner-status">{scanResult ? "Etiqueta detectada" : scanning ? "Procurando preço na imagem..." : "Preparando leitura automática..."}</div><p className="form-hint">Enquadre a etiqueta do mercado inteira. Evite apontar para o chão, pessoas ou embalagens sem a etiqueta de preço.</p>{scanResult && <div className="scan-result"><strong>Produto e preço identificados</strong><label className="scan-name-label">Nome do produto<input aria-label="Nome do produto identificado" value={scanResult.name} onChange={(event) => setScanResult((current) => current ? { ...current, name: event.target.value } : current)} placeholder="Ex.: Café 500 g"/></label><label className="scan-name-label">Preço por unidade (R$)<input aria-label="Preço unitário" inputMode="decimal" value={String(scanResult.price).replace(".", ",")} onChange={(event) => { const value = parseBRLAmount(event.target.value); if (value !== null) setScanResult((current) => current ? { ...current, price: value } : current); }}/></label><label className="scan-name-label">Quantidade desejada<input aria-label="Quantidade desejada" type="number" min="0.001" step="any" inputMode="decimal" value={scanQuantity} onChange={(event) => setScanQuantity(event.target.value)}/></label><div className="scan-subtotal"><span>Subtotal da compra</span><b>{formatBRL(Math.round(scanResult.price * Math.max(Number(scanQuantity.replace(",", ".")) || 0, 0) * 100))}</b></div><small>Confira o produto, o preço unitário e a quantidade. A soma será lançada no orçamento ao confirmar.</small></div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={closeScanner}>Cancelar</button>{scanResult ? <button type="button" className="primary-button" onClick={confirmScan}><Check size={17}/> Confirmar compra</button> : <button type="button" className="primary-button" disabled><Camera size={17}/>{scanning ? "Leitura automática ativa" : "Aguardando câmera"}</button>}</div></section></div>}

    </div>
  );
}

export default App;
