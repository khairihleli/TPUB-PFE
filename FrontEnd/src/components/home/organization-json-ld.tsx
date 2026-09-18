import { CONTACT, GROUP, SITE, SOCIAL, siteUrl } from "@/content/site";

/** schema.org Organization for ZELQANE, with Tukhnanutha as parent organization. */
export function buildOrganizationJsonLd(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: SITE.name,
    url: `${base}/`,
    logo: `${base}/brand/zelqane.png`,
    description: SITE.description,
    email: CONTACT.email,
    telephone: CONTACT.phone,
    address: {
      "@type": "PostalAddress",
      addressLocality: CONTACT.city,
      addressCountry: "TN",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "service commercial",
      email: CONTACT.email,
      telephone: CONTACT.phone,
      availableLanguage: ["fr"],
    },
    sameAs: [GROUP.zelqanePage],
    parentOrganization: {
      "@type": "Organization",
      name: GROUP.name,
      url: GROUP.url,
      sameAs: [SOCIAL.linkedin, SOCIAL.youtube],
    },
  } as const;
}

/**
 * Serialise for an inline <script type="application/ld+json"> text child: `<` is escaped so the
 * content can never close the script element.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function OrganizationJsonLd() {
  return (
    <script type="application/ld+json">
      {serializeJsonLd(buildOrganizationJsonLd(siteUrl()))}
    </script>
  );
}
