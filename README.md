# 💈 Gestão Financeira para Barbearia

Aplicativo web completo para o proprietário controlar as finanças da barbearia: receitas, despesas, fluxo de caixa, serviços/preços e relatórios exportáveis em PDF e Excel. Tema escuro premium (preto, grafite e dourado), responsivo para computador, tablet e celular.

> Sem agendamento: o foco é exclusivamente financeiro e administrativo.

## Como executar

Requisito: **Node.js 22.13 ou superior** (usa o SQLite embutido do Node, sem dependências nativas).

```bash
npm install
npm start            # http://localhost:3000
```

Opcional — popular com 12 meses de dados de exemplo:

```bash
npm run seed:demo -- --reset   # --reset apaga receitas/despesas antes
```

Variáveis de ambiente: `PORT` (padrão 3000), `HOST` (padrão 0.0.0.0), `DB_FILE` (padrão `data/barbearia.db`).

Testes da API: `npm test`.

## Versão de demonstração (GitHub Pages)

A pasta `docs/` contém uma versão **estática** do app para apresentar a clientes: roda inteira no navegador, sem servidor, com 12 meses de dados fictícios (salvos só no navegador de quem abre, com botão para restaurar). Dashboard e relatórios abrem no último mês fechado.

- Para publicar: no GitHub, **Settings → Pages → Build and deployment → Deploy from a branch**, escolha o branch e a pasta **`/docs`** e salve. Em ~1 minuto o link fica disponível (`https://<usuario>.github.io/<repositorio>/`).
- Depois de alterar o app, regenere a demo com `npm run build:demo` e faça commit da pasta `docs/`.

## Publicação (deploy)

O projeto inclui `Dockerfile`, `railway.json` e `render.yaml`.

**Variáveis importantes**

| Variável | Uso |
|---|---|
| `APP_PASSWORD` | **Defina sempre em produção.** Ativa a senha de acesso (o navegador pede usuário e senha; o usuário pode ser qualquer nome). |
| `DB_FILE` | Caminho do banco. No Docker o padrão é `/data/barbearia.db` — monte um **volume/disco persistente em `/data`**, senão os dados se perdem a cada nova publicação. |

**Railway:** New Project → Deploy from GitHub repo → selecione este repositório → em *Variables* adicione `APP_PASSWORD` → em *Settings* adicione um **Volume** montado em `/data` → *Networking* → *Generate Domain*.

**Render:** New → Blueprint → selecione este repositório (usa o `render.yaml`, que já cria o disco em `/data`) → informe `APP_PASSWORD`.

## Funcionalidades

| Tela | O que faz |
|---|---|
| **Dashboard** | Faturamento, despesas e lucro do mês em destaque; margem, serviços realizados, ticket médio e comparativo com o mês anterior. Gráficos: Faturamento × Despesas × Lucro (6 meses), evolução do faturamento (12 meses), receitas por serviço, despesas por categoria e comparativo mensal (margem + tabela). |
| **Receitas** | Lançamento rápido em 1 clique (escolhe a forma de pagamento e toca no serviço), formulário completo (data, serviço, quantidade, valor, pagamento, observações), edição/exclusão, filtros por período, serviço, forma de pagamento e busca. Faturamento por serviço calculado automaticamente. |
| **Despesas** | Cadastro com descrição, categoria (12 categorias), valor, data, tipo fixa/variável, pagamento e observações. Filtros por período, categoria, tipo, pagamento e busca. |
| **Caixa** | Saldo inicial + entradas − saídas = saldo final, movimentações com saldo acumulado, fechamento diário e mensal (com tabela de fechamentos por dia) e conferência por forma de pagamento. Exporta PDF/Excel. |
| **Relatórios** | Filtros por dia, semana, mês, ano ou período personalizado. Faturamento bruto, despesas, lucro, margem, ticket médio, serviços mais vendidos, receita por forma de pagamento, despesas por categoria, evolução financeira e demonstrativo do resultado. Exporta **PDF** e **Excel** (planilha com abas e formatação em R$). |
| **Serviços e preços** | Cadastro de serviços com nome, preço padrão, descrição e status ativo/inativo. Serviços com lançamentos não podem ser excluídos (apenas desativados), preservando o histórico. |
| **Configurações** | Nome da barbearia, saldo inicial do caixa, backup e restauração (JSON). |

Atalhos: botões **+ Receita / − Despesa** sempre visíveis (botão flutuante no celular) e teclas **R** e **D**.

## Regras de cálculo

- Faturamento bruto = soma das receitas (quantidade × valor cobrado)
- Despesas totais = soma das despesas
- Lucro líquido = faturamento bruto − despesas totais
- Margem de lucro = lucro líquido ÷ faturamento bruto × 100
- Ticket médio = faturamento bruto ÷ quantidade de serviços realizados

Todos os indicadores respeitam o período filtrado. Valores são armazenados em centavos (inteiros) para evitar erros de arredondamento.

## Padrões brasileiros

- Moeda em R$ (`1.234,56`), datas em DD/MM/AAAA (campo com máscara + calendário).
- A data de "hoje" e os horários dos relatórios usam o fuso **America/Sao_Paulo** (Brasília), independentemente do fuso do servidor ou do navegador.

## Arquitetura

```
server.js            # inicialização (Express + SQLite)
server/db.js         # esquema e dados iniciais
server/app.js        # API REST com validação
server/stats.js      # cálculos financeiros, séries e fluxo de caixa
shared/constants.js  # categorias, formas de pagamento (servidor e navegador)
public/              # SPA em JavaScript puro (sem etapa de build)
  js/views/          # telas
  js/charts.js       # Chart.js com paleta validada para tema escuro
  js/export.js       # PDF (jsPDF + AutoTable) e Excel (ExcelJS)
scripts/seed-demo.js # dados de demonstração
test/api.test.js     # testes de API
```

Os dados ficam no arquivo SQLite `data/barbearia.db` (persistente; não se perdem ao fechar o navegador). Faça backup copiando esse arquivo ou pela tela de Configurações.
