export default {
    id: "home",
    title: "Home",
    area: "General",
    tags: ["overview", "exam"],
    notesHtml: `
      <p><b>Mål:</b> offline toolkit til CompSys ITX.</p>
      <ul>
        <li>Brug venstre menu til at vælge værktøj.</li>
        <li><b>Compute</b> kører logik.</li>
        <li><b>Copy output</b> kopierer direkte til besvarelsen.</li>
        <li><b>Exam mode</b> skjuler notes-panel og gør UI større.</li>
      </ul>
    `,
    render(container, ctx) {
      container.innerHTML = `
        <p>Vælg et modul i venstre side.</p>
        <p>Start med <b>Cache</b> og <b>Virtual Memory</b> når vi implementerer dem.</p>
      `;
      ctx.setNotes?.(this.notesHtml);
    },
    compute() {
      return "Home har ingen compute() endnu.";
    },
  };
  