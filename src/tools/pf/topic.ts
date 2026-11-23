// src/tools/pf/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words that ask for the provident fund page, which has two tabs: the probable PF at retirement, and the EMI of a refundable PF loan.
// A line about the loan (emi, loan, instalment, repayment) opens the page on the loan tab. The loan EMI calculators of banks and societies are not here: the only EMI calculator is the PF loan's.
// How it looks in the panel is in ui.tsx; its logic is in the files beside this one. I list it once, in src/tools/registry.ts.
import { defineTopic } from "@/tools/types";

export const pfTopic = defineTopic({
  id: "pf",
  intent: { title: "Provident fund (PF): maturity and loan EMI", about: "Your probable provident fund (PF) corpus on the retirement day, worked from the DSP PF page (the monthly contributions, VPF and the interest); and the monthly instalment (EMI) of a refundable PF loan (interest 1% above the deposit's, up to 10 years, reducing balance).", words: ["pf", "epf", "provident", "fund", "maturity", "corpus", "balance", "vpf", "retirement", "retire", "superannuation", "pension", "accumulate", "savings", "loan", "emi", "instalment", "installment", "repay", "repayment", "borrow", "refundable", "tenure", "principal"] },
  form: {
    rank: 30,
    nouns: ["pf", "epf", "provident", "fund", "maturity", "corpus", "balance", "vpf", "loan", "loans", "emi", "emis", "refundable", "repayment", "installment", "installments", "instalment", "instalments"],
    wants: (c) => {
      const pf = c.has(["pf", "epf", "provident", "vpf"]);
      // The probable PF at retirement: "pf maturity calculator", "provident fund calculator".
      const maturity = pf && c.has(["maturity", "corpus", "calculator", "calculate", "calculation", "estimate", "estimator", "estimation"]) && !c.has(["loan", "loans", "emi", "emis"]);
      // The PF loan's EMI: "emi", "emi calculator", "loan emi", "pf loan", "pf loan emi", "loan calculator", "refundable pf loan".
      const loan = (c.has(["emi", "emis"])) || (c.has(["loan", "loans"]) && (pf || c.calcWord));
      return (maturity || loan) && c.only();
    },
  },
  samples: [
    { q: "pf maturity calculator", note: "the provident fund page, on its PF maturity tab: your probable provident fund on the retirement day, worked from the figures of your DSP PF page and payslip" },
    { q: "pf loan emi", note: "the same page, on its PF loan EMI tab: the monthly instalment of a refundable PF loan (interest 1% above the PF deposit's, at most 10 years and not beyond your service left, reducing balance); 'emi calculator' and 'refundable pf loan' open it too" },
  ],
});
