import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Camera, Check, ChevronRight, CircleHelp, Clock3, ShoppingBasket, ShoppingCart, SlidersHorizontal, Wallet, X, ScanLine, FileDown } from "lucide-react";
import { calculateSubtotal, formatBRL, parseBRLAmount } from "./lib/money";
import { createItem, loadState, saveState } from "./lib/storage";
import type { PurchaseRecord, ShoppingState } from "./types";

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
  const [scannerStep, setScannerStep] = useState<"barcode" | "price">("barcode");
  const [scannedProductName, setScannedProductName] = useState("");
  const [ocrPreview, setOcrPreview] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [scanQuantity, setScanQuantity] = useState("1");
  const [listModal, setListModal] = useState<"purchased" | "scanned" | null>(null);
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

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };
  const openScanner = () => {
    setScanResult(null);
    setScannerStep("price");
    setScannedProductName("");
    setOcrPreview("");
    setScanQuantity("1");
    setShowScanner(true);
  };
  useEffect(() => {
    if (!showScanner) return;
    let cancelled = false;
    let activeStream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("A câmera exige HTTPS e um navegador compatível. Abra pelo Chrome atualizado no Android.");
        activeStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        if (cancelled) { activeStream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = activeStream;
        const cameraTrack = activeStream.getVideoTracks()[0];
        if (cameraTrack) {
          try {
            await cameraTrack.applyConstraints({
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            } as MediaTrackConstraints);
          } catch {
            // Continuous autofocus is not supported by every mobile camera.
          }
        }
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
    if (!showScanner || !cameraReady || scannerStep !== "barcode" || scannedProductName) return;
    let cancelled = false;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    type BarcodeResult = { rawValue: string };
    type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<BarcodeResult[]> };
    type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
    const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    const runBarcodeScanner = async () => {
      if (!Detector) {
        setNotice("Seu navegador não oferece leitura de código de barras. Atualize o Chrome no Android para usar o leitor.");
        return;
      }
      setScanning(true);
      try {
        const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        while (!cancelled && videoRef.current) {
          const video = videoRef.current;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            const result = await detector.detect(video);
            const code = result[0]?.rawValue;
            if (code) {
              const response = await fetch("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(code) + ".json");
              if (!response.ok) throw new Error("Falha ao consultar o catálogo de produtos.");
              const data = await response.json() as { status?: number; product?: { product_name_pt?: string; product_name?: string } };
              const productName = data.product?.product_name_pt || data.product?.product_name || "";
              if (data.status === 1 && productName.trim()) {
                setScannedProductName(productName.trim());
                setScanResult({ name: productName.trim(), price: 0 });
                setScannerStep("price");
              } else {
                setNotice("Código de barras lido, mas o produto não consta no catálogo. Tente outro produto.");
              }
              break;
            }
          }
          await wait(200);
        }
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Não foi possível ler o código de barras.");
      } finally {
        if (!cancelled) setScanning(false);
      }
    };
    void runBarcodeScanner();
    return () => { cancelled = true; };
  }, [showScanner, cameraReady, scannerStep, scannedProductName]);

  const analyzeLabel = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || aiBusy) {
      setNotice("A câmera ainda não está pronta. Aguarde e tente novamente.");
      return;
    }
    setAiBusy(true);
    setOcrPreview("");
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1024 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível capturar a imagem da câmera.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.68);
      const imageBase64 = dataUrl.split(",")[1];
      const response = await fetch("https://xyhokqijijiazettmkgy.supabase.co/functions/v1/scan-label", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": "sb_publishable_sT6J9fzUQfB2jPIi2-Hncg_pXevsK8O"
        },
        body: JSON.stringify({ imageBase64, mimeType: "image/jpeg" }),
        signal: AbortSignal.timeout(45000)
      });
      const result = await response.json() as { productName?: string | null; price?: number | null; confidence?: number; notes?: string | null; error?: string };
      if (!response.ok) throw new Error(result.error || "Falha ao analisar a etiqueta.");
      if (!result.price || result.price <= 0) {
        setOcrPreview(result.notes || "Não consegui identificar o preço com segurança. Ajuste o enquadramento e tente novamente.");
        setNotice("A IA não conseguiu confirmar o preço. Aproxime a câmera e tente outra vez.");
        return;
      }
      const name = result.productName?.trim() || scannedProductName;
      setScannedProductName(name);
      setScanResult({ name, price: result.price });
      setOcrPreview("Leitura por IA · confiança aproximada: " + Math.round((result.confidence || 0) * 100) + "%");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setNotice(error instanceof DOMException && error.name === "TimeoutError"
        ? "A leitura excedeu 45 segundos. Tente novamente com a etiqueta mais próxima e nítida."
        : error instanceof TypeError && message.toLowerCase().includes("fetch")
          ? "Não foi possível conectar ao serviço de leitura. Verifique a internet e tente novamente."
          : message || "Não foi possível analisar a etiqueta.");
    } finally {
      setAiBusy(false);
    }
  };

  const closeScanner = () => {
    stopCamera();
    setShowScanner(false);
    setScanning(false);
    setScanResult(null);
    setScannerStep("barcode");
    setScannedProductName("");
  };
  const confirmScan = () => {
    if (!scanResult) return;
    const cleanName = scannedProductName.trim() || scanResult.name.trim();
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
  const modalItems = listModal === "purchased" ? state.items.filter((item) => item.checked) : state.items;

  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);

  const exportListPdf = () => {
    if (!listModal) return;
    const title = listModal === "purchased" ? "Itens comprados" : "Produtos escaneados";
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
      </style></head><body><div class="brand">SmartMarket</div><h1>${title}</h1><div class="sub">Gerado em ${new Date().toLocaleString("pt-BR")} · ${items.length} produto(s)</div><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Preço unitário</th><th>Subtotal</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Nenhum produto nesta lista.</td></tr>'}</tbody></table><div class="total">Total: ${formatBRL(totalCents)}</div><div class="foot">Documento gerado pelo SmartMarket.</div><script>window.onload=()=>window.print()<\/script></body></html>`);
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
        <section className="welcome-row"><div><p className="eyebrow">COMPRA DIRETO PELO LEITOR</p><h1>Olá, boas compras <span>✳</span></h1><p className="muted">Escaneie o produto, leia o preço e informe a quantidade.</p></div><button className="primary-button" onClick={openScanner}><ScanLine size={18}/> Escanear produto</button></section>

        <section className="hero-card">
          <div className="hero-copy"><span className="hero-kicker"><ShoppingBasket size={14}/> SEU DINHEIRO, BEM CUIDADO</span><h2>Compras inteligentes.<br/>Sem surpresas no caixa.</h2><p>Registre os preços, acompanhe o total<br className="desktop-break"/> e mantenha seu orçamento sob controle.</p><button className="hero-button" onClick={openScanner}><ScanLine size={17}/> Escanear primeiro produto <ChevronRight size={17}/></button></div>
          <div className="hero-art" aria-hidden="true"><ShoppingBasket size={118} strokeWidth={1.1}/><span className="art-leaf">✳</span></div>
        </section>

        <section className="stats-grid">
          <button type="button" className="stat-card stat-card-button" onClick={() => setListModal("purchased")} aria-label="Abrir lista de itens comprados"><div className="stat-top"><span>Total comprado</span><span className="stat-icon green"><Wallet size={18}/></span></div><strong>{formatBRL(totals.purchased)}</strong><small><ArrowUpRight size={13}/> {boughtCount} itens comprados · Ver lista</small></button>
          <button type="button" className="stat-card stat-card-button" onClick={() => setListModal("scanned")} aria-label="Abrir lista de produtos escaneados"><div className="stat-top"><span>Produtos escaneados</span><span className="stat-icon blue"><ShoppingBasket size={18}/></span></div><strong>{String(state.items.length).padStart(2, "0")} <em>itens</em></strong><small>Registrados durante esta compra · Ver lista</small></button>
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

      {listModal && <div className="modal-backdrop list-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setListModal(null); }}><section className="modal list-modal" role="dialog" aria-modal="true" aria-labelledby="list-modal-title"><div className="modal-heading"><div><p className="eyebrow">SMARTMARKET · SUA COMPRA</p><h2 id="list-modal-title">{listModal === "purchased" ? "Itens comprados" : "Produtos escaneados"}</h2><p className="muted">{modalItems.length} produto(s) na lista</p></div><button className="icon-button" onClick={() => setListModal(null)} aria-label="Fechar lista"><X/></button></div>{modalItems.length === 0 ? <div className="empty-state"><h4>Nenhum item nesta lista</h4><p>Os produtos aparecerão aqui após serem registrados.</p></div> : <div className="list-modal-items">{modalItems.map((item) => <div className="product-row" key={item.id}><div className="product-info"><strong>{item.name}</strong><span>{item.quantity.toLocaleString("pt-BR")} {item.measure} × {formatBRL(Math.round(item.unitPrice * 100))}</span></div><div className="product-price"><strong>{formatBRL(calculateSubtotal(item.unitPrice, item.quantity, item.measure))}</strong><small>subtotal</small></div></div>)}</div>}<div className="list-modal-total"><span>Total da lista</span><strong>{formatBRL(modalItems.reduce((sum, item) => sum + calculateSubtotal(item.unitPrice, item.quantity, item.measure), 0))}</strong></div><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setListModal(null)}>Fechar</button><button type="button" className="primary-button" onClick={exportListPdf}><FileDown size={17}/> Gerar PDF</button></div></section></div>}
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso"><X size={16}/></button></div>}
      {showScanner && <div className="modal-backdrop scanner-backdrop"><section className="modal scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><div className="modal-heading"><div><p className="eyebrow">COMPRA EM TEMPO REAL</p><h2 id="scanner-title">{scannerStep === "barcode" ? "Escanear produto" : "Ler etiqueta do produto"}</h2></div><button className="icon-button" onClick={closeScanner} aria-label="Fechar leitor"><X/></button></div><video ref={videoRef} className="scanner-video" playsInline muted/><p className="form-hint">{cameraReady ? (scannerStep === "barcode" ? "Aponte para o código de barras da embalagem ou escolha ler somente a etiqueta." : (scannedProductName ? "Produto: " + scannedProductName + ". Aponte para a etiqueta com o preço." : "Enquadre a etiqueta inteira. O aplicativo tentará reconhecer o nome e o preço.")) : "Iniciando câmera traseira..."}</p><div className="scanner-status">{scanResult?.price ? "Preço detectado" : aiBusy ? "Analisando a imagem com IA (limite de 45 segundos)..." : scanning ? (scannerStep === "barcode" ? "Procurando código de barras..." : "Etiqueta pronta para análise.") : "Preparando leitura automática..."}</div><p className="form-hint">{scannerStep === "barcode" ? "Aponte para o código de barras da embalagem." : "Aponte para a etiqueta inteira, com nome e preço nítidos. A leitura é automática."}</p>{scannerStep === "price" && <div className="ocr-debug"><strong>{ocrPreview ? "Resultado da análise:" : "Leitura inteligente:"}</strong><span>{ocrPreview || "Enquadre a etiqueta e toque em analisar. O Gemini tentará identificar o produto e o preço."}</span></div>}{scannerStep === "barcode" && <button type="button" className="text-button" onClick={() => { setScannedProductName(""); setScanResult(null); setScannerStep("price"); }}>Ler somente a etiqueta de preço</button>}{scannerStep === "price" && !scanResult?.price && <button type="button" className="primary-button" disabled={!cameraReady || aiBusy} onClick={analyzeLabel}><Camera size={17}/>{aiBusy ? "Analisando com Gemini..." : "Analisar etiqueta com IA"}</button>}{scanResult && scanResult.price > 0 && <div className="scan-result"><strong>Produto e preço identificados</strong><label className="scan-name-label">Produto identificado<input aria-label="Nome do produto identificado" value={scannedProductName} onChange={(event) => setScannedProductName(event.target.value)} placeholder="Digite o nome se a etiqueta não identificar"/></label><label className="scan-name-label">Preço por unidade (R$)<input aria-label="Preço unitário" inputMode="decimal" value={String(scanResult.price).replace(".", ",")} onChange={(event) => { const value = parseBRLAmount(event.target.value); if (value !== null) setScanResult((current) => current ? { ...current, price: value } : current); }}/></label><label className="scan-name-label">Quantidade desejada<input aria-label="Quantidade desejada" type="number" min="0.001" step="any" inputMode="decimal" value={scanQuantity} onChange={(event) => setScanQuantity(event.target.value)}/></label><div className="scan-subtotal"><span>Subtotal da compra</span><b>{formatBRL(Math.round(scanResult.price * Math.max(Number(scanQuantity.replace(",", ".")) || 0, 0) * 100))}</b></div><small>Confira o produto, o preço unitário e a quantidade. A soma será lançada no orçamento ao confirmar.</small></div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={closeScanner}>Cancelar</button>{scanResult && scanResult.price > 0 ? <button type="button" className="primary-button" onClick={confirmScan}><Check size={17}/> Adicionar à compra</button> : <button type="button" className="primary-button" disabled><Camera size={17}/>{scanning ? "Leitura automática ativa" : "Aguardando câmera"}</button>}</div></section></div>}

    </div>
  );
}

export default App;
