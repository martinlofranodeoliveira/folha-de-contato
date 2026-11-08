# Contrato da Folha de Contato 1.0.0

Aplicativo estático em português para páginas de produtos. Cada produto tem uma foto normalizada, nome, referência e preço opcional em BRL. Não há servidor, estoque, consulta de preços, checkout ou atualização automática. Nenhuma foto pessoal ou credencial acompanha o projeto.

## Documento portátil

Objeto JSON fechado, UTF-8, sem BOM, até 24 MiB antes do parse:

```json
{"schemaVersion":1,"settings":{"title":"Catálogo de produtos","subtitle":"","paper":"a4","orientation":"portrait","columns":3,"rows":3,"fit":"contain","showNumbers":true,"showPrices":true},"items":[]}
```

Cada item tem exatamente `id`, `fileName`, `name`, `reference`, `priceMinor`, `rotation`, `width`, `height`, `png`. IDs únicos `img-[1-9][0-9]{0,5}`. fileName é obrigatório, de 1 a 120 caracteres Unicode e com ao menos um caractere não branco; nome tem até 120 caracteres Unicode; referência até 32; título 80; subtítulo 140. Textos são linhas únicas e recusam controles C0/DEL e surrogates isolados. Nome pode ser vazio: a folha usa fileName como fallback. Referência vazia é ausência. Referências duplicadas são permitidas, IDs não.

`priceMinor` é null ou inteiro exato de 0 a 999999999 centavos BRL. Zero é um preço informado; null é ausência. Nenhuma conversão por ponto flutuante de um preço textual. `rotation` é 0,90,180,270. `width`/`height` são inteiros positivos até 800, com lado maior <=800. `png` é data:image/png;base64, seguido de base64 canônico e PNG com assinatura e IHDR coerentes com as dimensões declaradas. O validador estrutural não é um validador integral de chunks PNG; o navegador precisa decodificar todos os PNGs e confirmar as dimensões antes de importar.

Máximo de 32 itens, 2 MiB por PNG normalizado, soma de 16 MiB de PNGs e 16000000 pixels normalizados. Não inferir imagens externas nem aceitar SVG de entrada. A serialização canônica ordena chaves como o contrato, usa dois espaços e LF final, preserva ordem dos itens e os bytes embutidos. Objetos e arrays retornados pelo modelo são imutáveis, sem mutar os argumentos. Rejeitar campos extras, tipos incompatíveis, arrays/subclasses e accessors de objetos da API.

## Modelo puro · src/model.mjs

Exportar `LIMITS`, `ProjectError` (code + mensagem curta em português), `newProject()`, `validateProject(raw)`, `parseProjectText(text)`, `stringifyProject(project)`, `updateSettings(project,patch)`, `appendItems(project,items)`, `updateItem(project,id,patch)`, `moveItem(project,id,delta)`, `removeItem(project,id)`, `nextItemId(project)`, `projectStats(project)`, `formatPrice(minor)` e `parsePrice(text)`.

- newProject usa o documento vazio acima.
- updateSettings permite somente chaves de settings. paper a4/carta, orientation portrait/landscape, columns1..5, rows1..6, fit contain/cover, toggles booleanos exatos.
- updateItem permite somente name,reference,priceMinor,rotation; nada de substituir imagem por esse método.
- moveItem delta -1 ou 1; borda retorna o mesmo projeto. Itens desconhecidos são erro. nextItemId é o menor inteiro positivo ainda livre, com prefixo img-.
- projectStats retorna {items,pages,normalizedBytes,pixels}; pages zero para projeto vazio, senão ceil(items/(columns*rows)).
- formatPrice(null) retorna string vazia; demais BRL com separadores brasileiros e centavos exatos, exemplo R$ 1.234,56 (espaço ASCII).
- parsePrice aceita string vazia -> null, ou formato sem agrupamento `1234,56` / agrupado `1.234,56`, fração de um ou dois algarismos opcional, somente ASCII e sem sinal. Ponto significa apenas agrupamento de milhares. Espaço externo permitido. Retorna centavos inteiros dentro do limite; rejeitar exponentes, NaN, moeda embutida, agrupamento incorreto e ponto decimal ambíguo.
- Validadores podem reconhecer objetos congelados que eles próprios produziram para evitar redecodificar os mesmos PNGs a cada edição. Nunca confiar apenas em frozen vindo do chamador.

## Plano de página · src/layout.mjs

Exportar `planPages(project)` e, se útil, helpers puros. Saída {width,height,pages}; cada página {pageNumber,slots}, cada slot {itemId,ordinal,frame:{x,y,width,height},label:{x,y,width,height},nameLines:[...],detailLine,placement:{matrix:[a,b,c,d,e,f]}}. Matriz mapeia pixels do PNG original para a página, com rotação horária, centralização, escala contain/cover e clip na frame. Mesma matriz deve alimentar SVG; jamais calcular uma geometria diferente na UI.

A4 a 144 dpi =1191x1684; Carta=1224x1584. Paisagem troca dimensões. Margem56, espaço18, início das células y174; área inferior termina height-94. Cada célula reserva 64px finais para nome/referência/preço. Frames têm altura cellHeight-64, rótulos começam frame.bottom+10. Sequência por linhas, sem reordenar produtos na paginação. Ordinal global inicia em1; pageNumber inicia em1. Cada página tem no máximo columns*rows itens. Projeto vazio retorna pages[].

Nome/fallback em no máximo duas linhas, com elipse quando necessário; texto original continua no JSON. O plano usa uma estimativa conservadora de 16 px por caractere e reserva 36 px na primeira linha quando há numeração. Essa estimativa não é medição tipográfica nem garante aparência idêntica entre fontes de fallback; o SVG mantém o recorte como limite final de cada rótulo. Details mostra referência se presente e preço se showPrices e priceMinor!=null, separados por ' · '. Numeração é uma linha separada ou prefixo do nome, conforme o renderizador. Texto e imagens devem ficar geometricamente recortados para não invadir vizinhos, incluindo textos longos. Dimensões e proporções independem do zoom CSS. Nenhum relógio, data ou caminho absoluto entra no plano/exportação.

## SVG e IO · src/svg.mjs e src/image-io.mjs

`toSvg(project,pageIndex=0)` usa validateProject/planPages e retorna SVG próprio, UTF-8/LF, com width/height/viewBox. Índice inválido ou projeto vazio é erro. Todo texto escapado, somente elementos e atributos fixos, PNGs internos, IDs de clip gerados a partir de índices. U+FFFE e U+FFFF, aceitos no JSON mas excluídos pelo XML 1.0, são substituídos por U+FFFD apenas na renderização, sem alterar os dados do projeto. Sem script, style de usuário, foreignObject, links ou referência externa. Título/subtítulo cabem no cabeçalho com corte seguro, rodapé mostra página e total. Fonte disponível no visualizador pode alterar aparência; não prometer equivalência de cor/fontes entre navegadores.

`inspectSource(bytes)` recebe Uint8Array e retorna {mime,width,height} de PNG/JPEG. Antes de decodificar recusa >8MiB, dimensões inválidas ou >16000000 pixels e formatos não suportados. PNG: assinatura e IHDR; JPEG: varrer segmentos limitados até SOF permitido, ignorando metadados. Não interpretar EXIF por conta própria.

`normalizeLocalFile(file,id)` é assíncrono: confere cabeçalho/limites, decodifica uma vez com createImageBitmap(blob,{imageOrientation:'from-image'}), aceita dimensões orientadas iguais ou trocadas ao cabeçalho, reduz proporcionalmente ao lado máximo800 (não amplia), desenha canvas, exporta PNG com toBlob, valida limite/PNG. Retorna item com nome derivado do arquivo (sem extensão, '_' e '-' viram espaços), referência '', priceMinor null, rotation0, dimensões normalizadas e png. fileName é limitado/sanitizado para linha única. Fecha ImageBitmap em finally. Não registra bytes originais no projeto. Falhas/null de encoder são erros operacionais.

`validateEmbeddedImages(project)` decodifica cada PNG sequencialmente, confere width/height exatos e fecha recursos; importação da UI só substitui estado depois de todos passarem. `rasterizeSvg(svg,width,height)` retorna Blob PNG por canvas/toBlob, tratando erro/null, liberando URL/bitmap. O navegador pode impor limites próprios menores. A UI só chama com SVG gerado por toSvg, nunca entrada SVG arbitrária.

## Interface e operações

Preview de página, navegação de páginas, lista ordenada de produtos, seleção, mover por botão, rotação, nome/referência/preço, remover. Configurar título/subtítulo, A4/Carta, orientação, linhas/colunas, contain/cover, numeração e preços. Adicionar arquivos é lote atômico: uma falha preserva o projeto anterior. Importação de projeto é integral e atômica. Operações de arquivo/decode são sequenciais; tokens de operação e revisão impedem commits atrasados depois de novo projeto/importação mais recente/edições. Novas entradas nunca substituem silenciosamente alterações recentes. Downloads geram arquivos novos via navegador, não escrevem no disco sem a ação.

Exportar PNG/SVG da página atual e projeto JSON completo. Não guardar silenciosamente em localStorage/IndexedDB. Novo projeto confirma somente se houver dados; projeto de exemplo rotulado fictício, contendo seis produtos ilustrativos originais com referências e preços inventados. Usuário deve salvar JSON para continuar após recarga. Estados vazio/processando/erro/sucesso, rótulos/foco e reordenação por teclado acessível via botões. Preços são informados pelo usuário, sem alegação de consulta ou validação comercial.
