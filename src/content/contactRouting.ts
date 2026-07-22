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
  "dhajas2+yjvdd0rqeblowexkd64g@boards.trello.com";

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

export function resolveManagerByName(name: string | null | undefined) {
  if (!name) return null;
  const trimmed = name.trim();
  return contactManagers.find((m) => m.name === trimmed) ?? null;
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
