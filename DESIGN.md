---
name: Folha de Contato
description: Uma bancada verde para organizar produtos e conferir folhas de catálogo.
colors:
  ink: "#20372d"
  muted: "#536257"
  paper: "#fff"
  ground: "#eff0eb"
  stage: "#dce0d5"
  line: "#c6cec2"
  accent: "#e9b95d"
  accent-ink: "#3e3017"
  error: "#9a2c24"
  focus: "#b46518"
typography:
  identity:
    fontFamily: "Lato, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Lato, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Lato, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
  field:
    fontFamily: "Lato, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Lato, sans-serif"
    fontSize: "12px"
    fontWeight: 700
rounded:
  field: "5px"
  button: "7px"
  stage: "9px"
spacing:
  compact: "8px"
  control-gap: "12px"
  region-gap: "18px"
  panel-inset: "20px"
components:
  button-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "9px 13px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.button}"
    padding: "9px 13px"
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.button}"
    padding: "9px 13px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
    padding: "10px 11px"
  preview-stage:
    backgroundColor: "{colors.stage}"
    rounded: "{rounded.stage}"
  product-card:
    textColor: "{colors.ink}"
    rounded: "6px"
    width: "138px"
---

# Design System: Folha de Contato

## Overview

**Creative North Star: "Mesa de edição"**

A interface adota a bancada de montagem: verde profundo na identidade, uma área de trabalho clara e uma folha branca centralizada. O produto editado aparece tanto na página quanto na sequência de miniaturas; o contorno de seleção associa esses dois contextos ao formulário.

A densidade é de ferramenta de edição. Títulos curtos, campos compactos e ações visíveis cercam a prévia. O âmbar marca a entrada de fotos e os estados de atenção; a folha preserva sua própria geometria de impressão ao mudar a largura da janela.

**Key Characteristics:**

- Bancada em verdes discretos, com papel branco em destaque.
- Lato local nos controles, com pesos regular e negrito.
- Contornos e diferenças de superfície organizam os grupos.
- Sequência horizontal numerada e seleção sincronizada com a folha.

## Colors

A paleta combina uma bancada verde, neutros levemente esverdeados e uma ação âmbar. Os valores normativos estão no frontmatter e correspondem às propriedades de `styles.css`.

### Primary

- **Verde de bancada — ink:** cabeçalho, texto principal, botões de exportação e contorno da miniatura selecionada.
- **Âmbar de ação — accent / accent-ink:** adicionar fotos, símbolo da identidade e seleção de texto; a tinta escura mantém o texto da ação legível.

### Neutral

- **Papel — paper:** folha, campos e painel de edição.
- **Área de trabalho — ground:** fundo da aplicação.
- **Base de montagem — stage:** fundo que separa a folha branca do restante da ferramenta.
- **Verde de leitura secundária — muted:** instruções, dados auxiliares e contadores.
- **Linha vegetal — line:** bordas dos controles comuns.

O **vermelho de erro — error** identifica preço inválido e ações de remoção. O **âmbar de foco — focus** pertence aos contornos de teclado. O aviso de exemplo usa uma superfície bege específica, sem estabelecer uma segunda paleta.

**The Paper Rule.** O papel é branco; a bancada e os controles usam as superfícies verdes e neutras ao redor dele.

## Typography

**Display Font:** Lato, com fallback sans-serif.

**Body Font:** Lato, com fallback sans-serif. Os arquivos locais fornecem pesos regular e negrito; a interface desativa síntese de fonte.

**Character:** uma única família mantém controles e identidade próximos. Peso e tamanho estabelecem a hierarquia.

### Hierarchy

- **Identidade:** token `identity`; reduz para 22px entre 761px e 1000px e volta a 25px no cabeçalho móvel.
- **Título de área:** `headline` organiza o catálogo; no móvel, usa 20px.
- **Título de painel:** `title` apresenta a edição atual, com altura de linha explícita.
- **Campos:** `field` mantém os dados compactos no desktop; até 760px, o texto passa para 16px.
- **Rótulos:** `label` distingue instruções dos valores; rótulos móveis usam 13px.

Contadores de página, número de produtos e posições usam algarismos tabulares. Há texto auxiliar de 9–11px no artefato atual; essa densidade descreve os metadados existentes e não estabelece um tamanho padrão para novo conteúdo de leitura.

A folha exportada é uma superfície própria: usa `Arial, Helvetica, sans-serif`, título de 36px, subtítulo de 16px, nomes de produto de 15px e detalhes de 12px, nas coordenadas de exportação. Essa escolha não substitui a hierarquia Lato da interface.

## Layout

O conteúdo tem largura máxima de 1450px, margens automáticas e recuo lateral de 28px no desktop. A grade coloca a prévia flexível ao lado de um inspetor de 304px; a sequência ocupa toda a largura abaixo. A partir de 1450px, o inspetor cresce para 330px. Até 1000px, passa a 280px, com recuo externo de 20px.

Acima de 760px, a altura final da bancada é `clamp(300px, calc(28vw - 18px), 460px)`. O inspetor acompanha essa altura mais 56px e rola internamente, com abas fixas no topo. O intervalo vertical da grade é 14px. A folha se ajusta por JavaScript à largura e à altura internas disponíveis, preservando a proporção em retrato e paisagem.

Até 760px, o fluxo é **prévia → sequência → inspetor**, em uma coluna com recuo externo de 18px. A bancada usa `height: min(115vw, 560px)` e mínimo de 350px; o inspetor perde o limite de altura. Ações de arquivo formam uma grade de quatro colunas e, até 380px, passam a duas. O rodapé quebra em linhas.

A sequência rola horizontalmente, com encaixe por proximidade. Cada item mede 138px no desktop e 126px no móvel; as imagens têm janela de 64px e 87px, respectivamente. Formulários e painéis reutilizam os passos de espaçamento do frontmatter.

**The Same Product Rule.** A miniatura selecionada, seu formulário e o contorno na página representam o mesmo produto.

A folha de saída tem grade independente: margens laterais de 56px e intervalos de 18px nas coordenadas de exportação. Formato e orientação alteram a página sem comprimir sua proporção.

## Elevation & Depth

Camadas tonais separam o painel branco, a bancada e o fundo geral. Bordas dos campos e sublinhados das abas explicam estados sem elevação.

### Shadow Vocabulary

- **Papel:** `0 10px 28px #20372d26`, sombra suave da folha sobre a bancada.
- **Diálogo:** `0 20px 65px #172a2540`, acompanhada de fundo modal `#14251d73`.

**The Surface Rule.** Painéis e miniaturas permanecem planos. A folha e o diálogo recebem a sombra que explica sua sobreposição.

A folha entra com brilho e sombra em 380ms, usando `cubic-bezier(.16,1,.3,1)`. Não há transições gerais de hover. Botões pressionados deslocam 1px; a preferência por movimento reduzido desativa a animação e esse deslocamento.

## Shapes

A folha tem cantos retos. As superfícies da ferramenta usam curvas pequenas: campos e paginação seguem `field`, ações seguem `button` e a bancada segue `stage`. O inspetor usa 10px no desktop e 9px no móvel; miniaturas usam 6px, o aviso de exemplo 4px e o diálogo 12px. São papéis locais, não uma regra de arredondamento único.

Bordas comuns têm 1px. O produto selecionado recebe contorno de 2px; o foco de teclado usa 3px com afastamento de 3px. Ícones são SVG em linha, geralmente com 18px, traço de 1.7 e terminais arredondados.

## Components

### Buttons

Ações compactas, com texto em negrito. O padrão tem superfície branca, texto verde e borda fina; hover altera fundo e borda para verdes claros. O âmbar identifica adicionar fotos e clareia no hover. O verde escuro identifica a exportação principal e a continuação em diálogo. As ações do cabeçalho são transparentes; salvar projeto acrescenta borda visível.

O foco é comum, o pressionamento desloca 1px e o estado desabilitado usa opacidade de 0.45. Controles comuns têm altura mínima de 40px; ferramentas locais e paginação têm dimensões menores próprias.

### Chips

**Exemplo fictício** é um rótulo informativo bege, de tipo pequeno em negrito e curva curta. No catálogo próprio, o mesmo lugar mostra texto sem fundo. Não funciona como filtro.

### Cards / Containers

Miniaturas numeradas mantêm foto, nome e referência. A imagem é recortada numa janela horizontal; o nome ocupa uma linha com reticências. Contorno verde indica seleção; fundo claro indica hover. A numeração branca fica sobre a imagem.

O inspetor é um painel branco com conteúdo recortado pelos cantos, abas superiores e nota discreta de salvamento na base. Seu espaçamento interno cresce no desktop largo; não recebe sombra de papel.

### Inputs / Fields

Campos brancos com borda verde clara, curva `field` e texto escuro. O preço agrupa prefixo monetário e input numa borda única; o foco envolve o conjunto. Campos inválidos recebem borda de erro e campos desabilitados ganham fundo verde pálido. Opcionais aparecem junto ao rótulo; ajuda aparece abaixo do controle.

### Navigation

**Produto / Página** divide o painel em duas abas iguais; a ativa tem texto verde e sublinhado de 2px. A paginação central usa botões quadrados discretos e contador tabular. Links textuais mantêm sublinhado com afastamento de 4px.

### Preview and selection

O papel branco se ajusta à bancada e recebe sombra. O quadro de seleção âmbar tem 2px e acompanha apenas a imagem do produto selecionado; não intercepta eventos nem aparece na exportação. A legenda explica esse comportamento e oferece ampliação em outra guia.

## Do's and Don'ts

### Do:

- **Do** manter a sequência numerada e a seleção legível por contorno, além da cor.
- **Do** conservar o foco visível, os rótulos dos campos e os nomes acessíveis dos botões com ícones.
- **Do** ajustar a folha inteira à área disponível sem mudar sua proporção.
- **Do** manter os campos móveis com texto de 16px e altura mínima de 45px.
- **Do** usar SVG em linha para os ícones de interface, com traços arredondados.

### Don't:

- **Don't** aplicar a sombra da folha a todos os controles e cartões.
- **Don't** transportar o contorno de seleção da interface para o arquivo exportado.
- **Don't** esconder o estado selecionado das abas ou dos produtos.
- **Don't** substituir os arquivos locais de Lato por dependência remota de fonte.
