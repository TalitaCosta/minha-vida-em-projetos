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

## Armazenamento e backup

Os dados são armazenados no IndexedDB do navegador e dependem da origem (endereço/porta). Use sempre o mesmo endereço para acessar os mesmos projetos. Não use navegação anônima. Utilize **Backup** regularmente para baixar um JSON e **Importar** para restaurar ou mesclar registros por ID. A importação substitui projetos com IDs iguais.

## Recursos

- Cadastro, edição e exclusão de projetos
- Status, categoria, prioridade, prazo e próxima ação
- Checklist com progresso automático
- Indicador de projetos sem atualização por 7 dias
- Busca e filtros
- Exportação e importação JSON
