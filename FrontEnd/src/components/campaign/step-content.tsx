"use client";

import { ArrowLeft, ArrowRight, ScanSearch } from "lucide-react";
import { type Ref, useEffect, useMemo, useRef, useState } from "react";

import { AiAnalysisProgress, AiResultPanel } from "@/components/campaign/ai-analysis";
import { CreativeDropzone } from "@/components/campaign/creative-dropzone";
import { MediaGallery, useMediaUploads } from "@/components/campaign/media-gallery";
import { MAX_MEDIA_FILES, previewKind } from "@/components/campaign/media-model";
import {
  OrientationToggle,
  ScreenMockup,
  type ScreenOrientation,
} from "@/components/campaign/screen-mockup";
import { WizardStepHeading } from "@/components/campaign/wizard-chrome";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { aiApi, mediaApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type { AiReport, CampaignResponse, MediaFileResponse } from "@/lib/api/types";
import { isContentEditable } from "@/lib/campaign-status";
import { useUnsavedChangesGuard } from "@/lib/forms/unsaved-guard";
import { invalidate, resourceKeys } from "@/lib/resource-cache";
import { useResource } from "@/lib/use-resource";

export const NO_MEDIA_WARNING =
  "Aucun visuel : la campagne peut être soumise, mais l'analyse IA baissera son score de qualité et l'écran affichera un contenu générique.";

export interface StepContentProps {
  campaign: CampaignResponse;
  onBack: () => void;
  onNext: () => void;
  /** Media count changed (the wizard strip and campaign cache follow). */
  onMediaChange?: (count: number) => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

type Preanalysis =
  | { phase: "idle" }
  | { phase: "running"; startedAt: number }
  | { phase: "done"; report: AiReport }
  | { phase: "error"; message: string };

/**
 * Wizard step 2 « Contenu » (contract §5 F2): real uploads with progress, gallery with deletion,
 * on-screen preview, and an optional AI pre-analysis of the draft (nothing is submitted).
 */
export function StepContent({
  campaign,
  onBack,
  onNext,
  onMediaChange,
  headingRef,
}: StepContentProps) {
  const editable = isContentEditable(campaign.status);
  const resource = useResource(resourceKeys.campaignMedia(campaign.id), (signal) =>
    mediaApi.list(campaign.id, { signal }),
  );
  const media = useMemo(() => resource.data ?? [], [resource.data]);
  const [banner, setBanner] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<ScreenOrientation>("landscape");
  const [preanalysis, setPreanalysis] = useState<Preanalysis>({ phase: "idle" });

  const loaded = resource.data !== undefined;
  const mediaCount = media.length;
  const onMediaChangeRef = useRef(onMediaChange);
  useEffect(() => {
    onMediaChangeRef.current = onMediaChange;
  });
  useEffect(() => {
    if (loaded) onMediaChangeRef.current?.(mediaCount);
  }, [loaded, mediaCount]);

  const setMedia = (next: MediaFileResponse[]) => {
    resource.setData(next);
    invalidate(resourceKeys.campaignsMine);
  };

  const uploads = useMediaUploads(campaign.id, media.length, (uploaded) => {
    // Functional update: several files may land before a re-render.
    resource.setData((prev) => [...(prev ?? []), uploaded]);
    invalidate(resourceKeys.campaignsMine);
    setSelectedId(uploaded.id);
  });
  const uploading = uploads.uploads.some((u) => u.status === "uploading");
  useUnsavedChangesGuard({
    dirty: uploading,
    message: "Un envoi de fichier est en cours : quitter la page l'interrompra.",
  });

  const selected = media.find((m) => m.id === selectedId) ?? media[0] ?? null;
  const full = media.length >= MAX_MEDIA_FILES;

  const runPreanalysis = async () => {
    setPreanalysis({ phase: "running", startedAt: Date.now() });
    try {
      const report = await aiApi.checkContent(campaign.id);
      setPreanalysis({ phase: "done", report });
    } catch (e) {
      setPreanalysis({ phase: "error", message: presentError(e).message });
    }
  };

  return (
    <div>
      <WizardStepHeading
        step={2}
        title="Contenu de la campagne"
        lede="Déposez l'image, la bannière ou la vidéo diffusée sur les Porteurs. Vous pouvez lancer une pré-analyse IA avant la soumission."
        headingRef={headingRef}
      />

      {resource.error && !resource.data ? (
        <ErrorState error={resource.error} onRetry={resource.reload} scope="section" />
      ) : resource.loading && !resource.data ? (
        <LoadingRegion label="Chargement des médias…">
          <Skeleton className="h-48 w-full rounded-card" />
        </LoadingRegion>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] xl:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            {editable ? (
              <>
                <CreativeDropzone
                  onFiles={(files) => void uploads.upload(files, { banner })}
                  disabled={full}
                  disabledReason={
                    full ? `Maximum atteint : ${MAX_MEDIA_FILES} médias par campagne.` : null
                  }
                  error={uploads.rejection}
                />
                <Checkbox
                  checked={banner}
                  onChange={(e) => setBanner(e.target.checked)}
                  label="Importer les images comme bannières"
                  description="Une bannière est un visuel horizontal allongé (bandeau). Sans effet sur les vidéos."
                />
              </>
            ) : (
              <Alert tone="info" live="none">
                Les médias ne sont modifiables que sur un brouillon.
              </Alert>
            )}

            {media.length > 0 || uploads.uploads.length > 0 ? (
              <MediaGallery
                campaignId={campaign.id}
                media={media}
                uploads={uploads.uploads}
                onDismissUpload={uploads.dismiss}
                selectedId={selected?.id ?? null}
                onSelect={(m) => setSelectedId(m.id)}
                editable={editable}
                onDeleted={(id) => setMedia(media.filter((m) => m.id !== id))}
              />
            ) : (
              <Alert tone="warning" live="none" title="Aucun visuel pour l'instant">
                {NO_MEDIA_WARNING}
              </Alert>
            )}
          </div>

          <div className="min-w-0 rounded-panel border border-line bg-surface p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="font-label text-[0.875rem] font-semibold text-ink-strong">
                Aperçu à l&apos;écran
              </p>
              <OrientationToggle value={orientation} onChange={setOrientation} />
            </div>
            <ScreenMockup
              creative={
                selected
                  ? {
                      url: selected.url,
                      kind: previewKind(selected.fileType),
                      name: selected.fileName,
                    }
                  : null
              }
              orientation={orientation}
              campaignName={campaign.name}
              objective={campaign.objective}
            />
          </div>
        </div>
      )}

      <section aria-labelledby="preanalyse-titre" className="mt-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="preanalyse-titre"
              className="font-display text-[1.0625rem] font-semibold text-ink-strong"
            >
              Pré-analyse IA
            </h3>
            <p className="mt-1 max-w-2xl text-[0.875rem] text-muted">
              Vérifie le texte, les visuels (dont le texte dans l&apos;image) et les règles TPUB. La
              campagne reste en brouillon.
            </p>
          </div>
          <Button
            variant="secondary"
            iconLeft={<ScanSearch aria-hidden="true" />}
            loading={preanalysis.phase === "running"}
            loadingLabel="Pré-analyse en cours"
            disabledReason={
              !editable
                ? "Pré-analyse réservée aux brouillons."
                : uploading
                  ? "Attendez la fin de l'envoi des fichiers."
                  : null
            }
            onClick={() => void runPreanalysis()}
          >
            {preanalysis.phase === "done" ? "Relancer la pré-analyse" : "Pré-analyse IA"}
          </Button>
        </div>
        {preanalysis.phase === "running" ? (
          <AiAnalysisProgress
            campaignName={campaign.name}
            objective={campaign.objective}
            startedAt={preanalysis.startedAt}
            title="Pré-analyse IA en cours…"
          />
        ) : preanalysis.phase === "done" ? (
          <AiResultPanel report={preanalysis.report} preview />
        ) : preanalysis.phase === "error" ? (
          <Alert tone="danger" title="Pré-analyse impossible">
            {preanalysis.message}
          </Alert>
        ) : null}
      </section>

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" iconLeft={<ArrowLeft aria-hidden="true" />} onClick={onBack}>
          Détails
        </Button>
        <Button
          variant="primary"
          size="lg"
          iconRight={<ArrowRight aria-hidden="true" />}
          disabledReason={uploading ? "Attendez la fin de l'envoi des fichiers." : null}
          onClick={onNext}
        >
          {media.length === 0 ? "Continuer sans visuel" : "Continuer vers la zone"}
        </Button>
      </div>
    </div>
  );
}
