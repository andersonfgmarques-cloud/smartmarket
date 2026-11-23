# SmartMarket

PWA pessoal para organizar compras de supermercado, ler preços de etiquetas e acompanhar o orçamento em tempo real.

## Stack
- React + TypeScript + Vite
- IndexedDB para persistência local
- PWA com manifest e service worker
- Vitest para testes
- GitHub Actions para CI

## Desenvolvimento
```bash
npm ci
npm run dev
```

## Validação
```bash
npm run lint
npm run test
npm run build
```

## Estado do projeto
Fundação inicial: dashboard, cadastro de itens, cálculo por unidade/peso, orçamento e persistência local. Scanner OCR e refinamentos PWA serão implementados nas próximas etapas.
