import { notFound } from "next/navigation";

/** Unknown /admin/** URL: render the in-app 404 inside the admin layout (IA-01). */
export default function UnknownRoute(): never {
  notFound();
}
