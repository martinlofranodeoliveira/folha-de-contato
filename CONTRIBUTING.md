# Como contribuir

Contribuições podem melhorar o fluxo de catálogo, corrigir falhas, ampliar testes ou tornar a documentação mais clara. Antes de mudar o formato de projeto ou uma regra de exportação, leia [SPEC.md](SPEC.md).

## Preparar o ambiente

Use Node.js 22 ou superior, npm e Python 3 disponível como `python3`. Python é usado nos testes XML; não é necessário para executar o aplicativo no navegador.

```bash
npm ci --ignore-scripts
npm test
npm run build
npm run check
npm run dev
```

O último comando serve `dist/` em [http://127.0.0.1:4178/](http://127.0.0.1:4178/). Execute o build novamente depois de editar as fontes e recarregue o navegador. O servidor local não oferece recarga automática.

Não adicione bibliotecas de execução apenas para substituir uma função pequena já coberta pelo contrato. Se uma dependência for necessária, explique o benefício e registre sua licença e sua origem em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Propor uma mudança

Abra uma issue ou pull request com o objetivo, a entrada que reproduz o problema e o comportamento esperado. Para um erro de imagem ou projeto, forneça um exemplo mínimo sintético. Não anexe fotos de clientes, catálogos privados, credenciais ou arquivos pessoais.

Para código, inclua a reprodução relevante e descreva os testes executados. Para interface, confira a tarefa em tela larga e estreita: seleção, edição, navegação, exportação, foco de teclado e mensagens de erro. Uma captura demonstra o que foi observado; não substitui o teste da operação.

## Invariantes a preservar

- O modelo não altera seus argumentos e retorna documentos imutáveis.
- Preço ausente permanece diferente de zero; preços são centavos inteiros informados pelo usuário.
- Fotos são PNG/JPEG escolhidos explicitamente e normalizadas dentro dos limites, sem gravar os originais no projeto.
- A importação só substitui o catálogo depois da validação completa, incluindo decodificação das imagens.
- Uma operação antiga não pode sobrescrever um projeto ou edição mais recente.
- A geometria de exportação usa o mesmo plano de página da prévia.
- SVG é gerado pelo aplicativo, com texto escapado e imagens internas; não aceita scripts, referências externas ou SVG de entrada.
- Não há salvamento automático, envio de catálogo a servidor ou dependência de serviço comercial.

Mudanças nesses comportamentos precisam atualizar o contrato e a documentação correspondente. Alterar a versão do projeto JSON exige um caminho explícito para ler ou migrar arquivos anteriores; não modifique seu significado silenciosamente.

## Dados de teste e licença

Use textos e imagens sintéticos nos testes. Preserve os avisos das fontes Lato e a documentação de origem dos assets. A imagem do exemplo foi gerada especificamente para esta demonstração; não a descreva como catálogo comercial real.

As contribuições de código e documentação devem poder ser distribuídas sob a [licença MIT](LICENSE). Componentes de terceiros mantêm suas próprias condições. Para falhas que não podem ser relatadas publicamente com segurança, consulte [SECURITY.md](SECURITY.md).
