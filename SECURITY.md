# Segurança e arquivos locais

A Folha de Contato processa imagens e projetos no navegador. A aplicação não possui backend para receber catálogos, não tem autenticação e não salva dados em localStorage ou IndexedDB. O carregamento da própria página, dos módulos e dos assets depende do servidor que os hospeda. Ao seguir um link externo, aplicam-se as condições do destino.

## O que existe nos arquivos exportados

O projeto JSON contém fotos normalizadas, nomes de arquivos, nomes de produtos, referências, preços e configurações. Ele permite restaurar o catálogo e **não é anônimo nem criptografado**. PNG e SVG mostram os dados incluídos na página; o SVG também contém as imagens embutidas. Confira o conteúdo antes de compartilhar.

O arquivo original da foto não é preservado: o navegador decodifica e redesenha seus pixels em um PNG reduzido. O nome do arquivo continua no projeto. Essa normalização não equivale a uma política de anonimização das imagens ou do conteúdo visível.

Fechar a aba pode perder alterações não salvas. **Salvar projeto** solicita um download explícito; mantenha uma cópia do JSON se quiser continuar a edição. O aplicativo não confirma que o arquivo foi gravado com sucesso pelo sistema operacional.

## Entradas e limites

Fotos de entrada são limitadas a PNG/JPEG, bytes e dimensões declaradas. Projetos JSON têm esquema fechado, limites de tamanho, base64 canônico e conferência das dimensões dos PNGs. Antes de substituir o estado, a interface decodifica todas as imagens do projeto. Uma importação ou lote inválido preserva o catálogo anterior.

Os limites reduzem a quantidade de dados aceita, mas não constituem uma sandbox de consumo de memória. A decodificação e a renderização dependem do navegador; mantenha-o atualizado e não suponha que um arquivo desconhecido seja seguro apenas por passar na conferência estrutural. O validador de cabeçalho não pretende validar integralmente todos os chunks PNG ou metadados JPEG.

O SVG de saída é construído pelo aplicativo com elementos fixos, textos escapados e PNGs internos. Não são admitidos SVGs de entrada, URLs de fotos externas, scripts ou `foreignObject`. Não substitua esse fluxo por inserção direta de conteúdo importado no DOM.

## Relatar um problema

Para um problema que possa ser demonstrado publicamente, abra uma issue com versão, navegador, passos e um arquivo mínimo sintético. Informe o resultado observado e o esperado; evite anexar um catálogo inteiro.

Se a reprodução exigir informações confidenciais ou revelar uma falha explorável, prefira o relato privado da aba **Security**, quando esse recurso estiver disponível no repositório. Caso não esteja, use o contato indicado no [site da LOFRANO TECNOLOGIA](https://lofranotecnologia.com.br) para combinar um canal privado antes de enviar arquivos. Não publique senhas, tokens, dados pessoais ou imagens de terceiros na issue.

Não há prazo de resposta ou garantia de suporte declarados. Esta política descreve o tratamento proposto para o projeto, não uma certificação de segurança ou auditoria integral de navegadores.
