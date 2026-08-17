# Ciclo 6.4.1 — Qualidade de renda e proteção do savings rate

O 6.4 real revelou um caso importante: nenhuma renda confirmada e apenas poucas entradas BANK/CREDIT de baixa confiança geraram um savings rate extremamente negativo. Isso não é um erro matemático; é um erro de qualidade do denominador.

A correção faz o engine publicar savings/savings rate apenas quando existe ao menos uma entrada de renda confirmada **e** a renda classificada cobre pelo menos 50% das entradas BANK do período. Isso evita outro caso enganoso: uma renda confirmada pequena diante de muitas entradas não classificadas. Entradas BANK/CREDIT sem semântica continuam visíveis como liquidez e passam a ser contabilizadas como `unclassifiedBankInflows`, não como renda.

Novos sinais:

- `income.quality`: `reliable`, `partial` ou `insufficient`
- `income.unclassifiedBankInflows`
- `income.unclassifiedBankInflowCount`
- `income.classifiedIncomeShareOfBankInflowsPct`
- `savings.available`
- `savings.unavailableReason`

O objetivo é preferir `n/d` a uma métrica precisa porém semanticamente falsa.
