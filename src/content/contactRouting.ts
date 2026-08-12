// src/content/contactRouting.ts

export type ContactManager = {
  name: string;
  email: string;
  trelloUsername: string; // include leading "@"
  calendlyUrl: string;
};

export type EnquiryTopic = {
  label: string; // user-facing
  trelloLabel: string; // e.g. "#IXN"
};

export const enquiriesTrelloBoardEmail =
  "uclcomputersciencealliances+e1iwirenv1yyv1kekohk@boards.trello.com";

// Sentinel manager id for "the Strategic Alliances Team" in manager dropdowns,
// alongside real admin User ids. A cuid can never equal it.
export const SAT_MANAGER_ID = "SAT";

export const contactManagers: ContactManager[] = [
  {
    name: "Daniel Hajas",
    email: "d.hajas@ucl.ac.uk",
    trelloUsername: "@dhajas2",
    calendlyUrl:
      "https://calendly.com/ucl-cs-alliances/client-experience-meeting-with-daniel",
  },
  {
    name: "Danielle Garratt",
    email: "daniellegarratt2304@hotmail.co.uk",
    trelloUsername: "@daniellegarratt",
    calendlyUrl: "https://calendly.com/ucl-cs-alliances/",
  },
  {
    name: "Tim Bodley-Scott",
    email: "t.bodley-scott@ucl.ac.uk",
    trelloUsername: "@timbodleyscott",
    calendlyUrl:
      "https://calendly.com/ucl-cs-alliances/client-experience-meeting-with-tim",
  },
  {
    name: "Marco Piccionello",
    email: "m.piccionello@ucl.ac.uk",
    trelloUsername: "@marcopiccionello",
    calendlyUrl:
      "https://calendly.com/ucl-cs-alliances/client-experience-meeting-with-marco",
  },
  {
    name: "Mehran Allybaccus",
    email: "m.allybaccus@ucl.ac.uk",
    trelloUsername: "@mehranallybaccus",
    calendlyUrl:
      "https://calendly.com/ucl-cs-alliances/client-experience-meeting-with-mehran",
  },
  {
    name: "Strategic Alliances Team",
    email: "cs.strategicalliancesteam@ucl.ac.uk",
    trelloUsername: "@timbodleyscott",
    calendlyUrl: "https://calendly.com/ucl-cs-alliances/",
  },
];

export const enquiryTopics: EnquiryTopic[] = [
  { label: "IXN and IXN Pro", trelloLabel: "#IXN" },
  { label: "General Enquiry", trelloLabel: "#General" },
];

/**
 * Calendly/Trello routing metadata for an assigned admin, matched on the email
 * both records share. Null when the admin has no entry here — callers fall
 * back to the SAT team's metadata.
 */
export function resolveManagerByEmail(email: string | null | undefined) {
  if (!email) return null;
  const needle = email.trim().toLowerCase();
  return contactManagers.find((m) => m.email.toLowerCase() === needle) ?? null;
}

export function getSatTeamManager() {
  return (
    contactManagers.find((m) => m.name === "Strategic Alliances Team") ??
    contactManagers[contactManagers.length - 1]
  );
}

export function resolveTopicByLabel(label: string | null | undefined) {
  if (!label) return null;
  const trimmed = label.trim();
  return enquiryTopics.find((t) => t.label === trimmed) ?? null;
}
