import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";
import {
  buildStatusRows,
  STATUS_SECTION,
  type StatusRow,
} from "@/components/story/fonctionnement-content";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";

const COLUMNS: readonly DataTableColumn<StatusRow>[] = [
  {
    key: "statut",
    header: "Statut",
    primary: true,
    className: "w-[1%] whitespace-nowrap",
    cell: (row) => <StatusPill type="campaign-status" status={row.key} />,
  },
  {
    key: "sens",
    header: "Ce que ça veut dire",
    cell: (row) => <span className="text-ink-soft">{row.description}</span>,
  },
  {
    key: "action",
    header: "Dans votre espace",
    className: "md:w-[30%]",
    cell: (row) => <span className="text-muted">{row.action}</span>,
  },
];

/** Public campaign status table — labels and descriptions come from `@/lib/campaign-status`. */
export function StatusTable() {
  const rows = buildStatusRows();
  return (
    <Section id="statuts" tone="band" labelledBy="statuts-titre">
      <SectionHeader
        id="statuts-titre"
        eyebrow={STATUS_SECTION.eyebrow}
        title={STATUS_SECTION.title}
        highlight={STATUS_SECTION.highlight}
        lede={STATUS_SECTION.lede}
        align="split"
      />
      <Reveal variant="up">
        <DataTable
          columns={COLUMNS}
          rows={rows}
          getRowKey={(row) => row.key}
          caption="Statuts d'une campagne et ce qu'ils signifient"
        />
      </Reveal>
      <p className="mt-5 text-[0.8125rem] text-muted-2">
        «&nbsp;Programmée&nbsp;» se déduit des dates&nbsp;: la campagne est validée mais sa date de
        début n&apos;est pas encore atteinte. De même, une campagne dont la date de fin est passée
        s&apos;affiche «&nbsp;Terminée&nbsp;».
      </p>
    </Section>
  );
}
