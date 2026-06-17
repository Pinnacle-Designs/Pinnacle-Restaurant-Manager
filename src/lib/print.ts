/** Update the print timestamp stamp, then open the browser print dialog. */
export function printReport(reportTitle?: string) {
  const stamp = document.getElementById("print-report-stamp");
  if (stamp) {
    stamp.textContent = `Printed ${new Date().toLocaleString()}`;
  }

  const prevTitle = document.title;
  if (reportTitle) {
    document.title = `${reportTitle} — Pinnacle`;
  }

  const cleanup = () => {
    if (reportTitle) document.title = prevTitle;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}
