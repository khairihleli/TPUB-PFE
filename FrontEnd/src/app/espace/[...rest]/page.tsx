import { notFound } from "next/navigation";

/** Unknown /espace/** URL: render the in-app 404 inside the espace layout (IA-01). */
export default function UnknownRoute(): never {
  notFound();
}
