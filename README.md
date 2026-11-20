# Minha Vida em Projetos

Painel local de projetos com React, Vite, TypeScript e IndexedDB (Dexie).

## Iniciar

Requisitos: Node.js 20.19+ ou 22.12+.

```bash
npm install
npm run dev
```

Abra o endereço indicado pelo Vite (normalmente http://localhost:5173).

## Gerar versão de produção

```bash
npm run build
npm run preview
```

Abra `http://localhost:4173/minha-vida-em-projetos/` para conferir o build.

## Publicação no GitHub Pages

No repositório `minha-vida-em-projetos`, selecione **GitHub Actions** em **Settings → Pages → Source**. O workflow `.github/workflows/deploy.yml` compila e publica `dist` após um push na `main). Também pode ser iniciado pela aba **Actions**.

O endereço padrão será `https://<usuario>.github.io/minha-vida-em-projetos/`. As rotas usam fragmentos, como `#/projetos/<id>`, e podem ser abertas diretamente ou recarregadas.

## Armazenamento e backup

Os dados ficam no IndexedDB do navegador, separados por origem (protocolo, domínio e porta). Para levar os projetos de `localhost` ao GitHub Pages, use **Exportar backup** no endereço local e **Importar backup** no endereço publicado. Guarde o ZIP fora do repositório. A importação aceita backups JSON antigos, com opções de mesclar ou substituir os dados.

## Recursos

- Cadastro, edição e exclusão de projetos
- Status, categoria, prioridade, prazo e próxima ação
- Checklist com progresso automático
- Indicador de projetos sem atualização por 7 dias
- Busca e filtros
- Exportação ZIP e importação ZIP ou JSON legado
