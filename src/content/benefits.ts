// src/content/benefits.ts

export type MembershipTierKey = "bronze" | "silver" | "gold" | "platinum";

export const MEMBERSHIP_TIER_RANK: Record<MembershipTierKey, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

export type BenefitId =
  | "B01"
  | "B02"
  | "B03"
  | "B04"
  | "B05"
  | "B06"
  | "B07"
  | "B08"
  | "B09"
  | "B10"
  | "B11"
  | "B12"
  | "B13"
  | "B14"
  | "B15"
  | "B16"
  | "B17";

export type BenefitProcess = {
  trigger?: string;
  actions?: string[];
  outcome?: string;
};

export type Benefit = {
  id: BenefitId;
  tierMin: MembershipTierKey;
  category:
    | "Workforce Development & Talent Acquisition"
    | "Innovation"
    | "PR & Networking"
    | "Operations";
  label: string;
  description: string;
  supersedes?: BenefitId[];
  process?: BenefitProcess;
  terms?: string[];
};

export const BENEFITS: Benefit[] = [
  //
  // B01 – IXN project collaboration
  //
  {
    id: "B01",
    tierMin: "bronze",
    category: "Innovation",
    label: "IXN Undergraduate or Graduate Project Collaboration",
    description:
      "Partner with a student team to explore a real research or innovation challenge. This provides early access to emerging talent while advancing ideas that benefit your organisation. Projects can support R&D pipelines, rapid prototyping, and feasibility exploration.",
    process: {
      trigger: "A call for IXN project proposals is released to industry partners.",
      actions: [
        "The partner submits a project proposal through the standard IXN form.",
        "Module leaders review proposals for suitability and alignment with learning outcomes.",
        "Module leaders approve or decline proposals based on academic fit and student capacity.",
        "The Strategic Alliances Team (SAT) confirms acceptance and initiates a framework agreement if one is not already in place.",
        "The framework agreement is negotiated and signed between the partner and UCL.",
        "Student letters and project confirmation letters are issued.",
        "The project is assigned to a student team and an academic supervisor.",
      ],
      outcome:
        "The student project begins following the academic module schedule, with regular supervision and agreed deliverables.",
    },
    terms: [
      "Not all proposals can be assigned; allocation depends on academic approval and student capacity.",
      "Projects must align with academic learning objectives and may be refined during scoping.",
      "Projects follow academic timelines and cannot be accelerated to match commercial deadlines.",
      "Partners must provide a suitable project brief and a named point of contact.",
      "Project deliverables are educational in nature and are not guaranteed to meet production standards.",
    ],
  },

  //
  // B02 – Brand visibility on web
  //
  {
    id: "B02",
    tierMin: "silver",
    category: "PR & Networking",
    label: "Brand Visibility on the UCL Computer Science Website",
    description:
      "Showcase your organisation as an innovation partner recognised by one of the UK’s leading Computer Science departments. This visibility strengthens your employer brand and signals commitment to research and talent development.",
    process: {
      trigger: "The partner is confirmed as a member of Friends of UCL Computer Science.",
      actions: [
        "SAT requests branding assets from the partner, including logo, short description, and preferred link.",
        "The Communications team reviews all assets for UCL editorial and brand compliance.",
        "Any required adjustments are agreed with the partner.",
        "The departmental website is updated with the partner listing under the relevant partner section.",
      ],
      outcome:
        "The partner’s brand appears on the UCL Computer Science website under “Friends of UCL Computer Science”, improving visibility and recognition.",
    },
    terms: [
      "Logo placement follows UCL’s editorial and brand guidelines.",
      "Visibility is limited to designated partner pages and associated sections.",
      "Updates to branding (such as logo or description changes) must be provided by the partner.",
      "UCL reserves the right to adjust or remove branding that no longer complies with institutional guidelines.",
    ],
  },

  //
  // B03 – Presentation slot at careers fair
  //
  {
    id: "B03",
    tierMin: "silver",
    category: "Workforce Development & Talent Acquisition",
    label: "Presentation Slot at a Student Careers Fair",
    description:
      "Engage directly with high-calibre students through a dedicated presentation at one of our flagship career events. This creates a high-impact platform to tell your story, showcase opportunities, and stand out in a competitive recruitment landscape.",
    process: {
      trigger: "The careers fair planning cycle for the relevant term begins.",
      actions: [
        "SAT confirms the number and format of presentation slots in partnership with the UCL Careers Service.",
        "SAT allocates a presentation slot to the partner, subject to availability.",
        "The partner receives guidance on recommended format, length, and AV requirements.",
        "The Communications team includes the partner’s presentation in event promotions to students.",
        "The presentation is delivered during the careers fair according to the agreed schedule.",
      ],
      outcome:
        "The partner delivers a dedicated presentation to a student audience, supporting recruitment and employer branding goals.",
    },
    terms: [
      "Presentation slots are limited and may be allocated on a first-come or rotational basis.",
      "All activity is facilitated jointly with the UCL Careers Service; final arrangements depend on Careers Service policies and availability.",
      "Presentation content must align with UCL guidelines and be appropriate for student audiences.",
      "UCL provides standard AV support but does not offer bespoke technical production.",
    ],
  },

  //
  // B04 – Promotion of job roles
  //
  {
    id: "B04",
    tierMin: "silver",
    category: "Workforce Development & Talent Acquisition",
    label: "Promotion of Up to Two Job Roles per Year",
    description:
      "Share key vacancies directly with our student and alumni networks. This targeted promotion increases reach, improves candidate quality, and can help accelerate recruitment timelines.",
    process: {
      trigger: "The partner identifies a role suitable for promotion and submits vacancy details to SAT.",
      actions: [
        "SAT reviews the job description for clarity, suitability, and alignment with student and graduate audiences.",
        "SAT confirms the promotion schedule and channels with the partner.",
        "Vacancies are posted through approved student and alumni communication channels.",
        "The Communications team schedules up to two promotional pushes within the membership year.",
      ],
      outcome:
        "The job roles are shared with relevant student and alumni audiences, increasing visibility and reach.",
    },
    terms: [
      "Promotion is limited to a maximum of two roles per membership year.",
      "UCL does not guarantee applicant numbers, hiring outcomes, or time-to-hire.",
      "The partner must supply accurate, complete, and up-to-date information for promotional materials.",
      "Roles must comply with UCL’s guidelines on fair recruitment and equal opportunities.",
    ],
  },

  //
  // B05 – Student project showcase invitation
  //
  {
    id: "B05",
    tierMin: "silver",
    category: "PR & Networking",
    label: "Invitation to the Student Project Showcase",
    description:
      "Attend our annual exhibition of student innovation across disciplines. It is an excellent opportunity to spot emerging talent, discover fresh ideas, and connect with students and academics working at the forefront of computing.",
    process: {
      trigger: "The student project showcase event is confirmed and announced.",
      actions: [
        "SAT allocates member spaces for the event based on capacity and relevance.",
        "Invitations are issued to the partner’s nominated contacts.",
        "RSVPs are collected and shared with event organisers.",
        "Confirmed attendees receive joining instructions and access information.",
      ],
      outcome:
        "Partner representatives attend the showcase, meet students and staff, and explore opportunities for collaboration and recruitment.",
    },
    terms: [
      "Space at the showcase may be limited depending on venue capacity and event design.",
      "Registration or RSVP is required for entry.",
      "Attendance may be capped per organisation to ensure balanced representation.",
    ],
  },

  //
  // B06 – Sponsored student engagement event
  //
  {
    id: "B06",
    tierMin: "silver",
    category: "Workforce Development & Talent Acquisition",
    label:
      "Sponsorship of a Student Engagement Event (Including Catering for 50)",
    description:
      "Host an on-campus event that brings students and your team together in a focused, well-supported environment. This strengthens brand presence, creates direct engagement opportunities, and supports early-career pipeline development.",
    process: {
      trigger:
        "The partner expresses interest in sponsoring an engagement event, or SAT proposes a suitable opportunity.",
      actions: [
        "SAT works with the partner to identify a suitable event format (e.g., networking evening, themed talk).",
        "Budget, catering scope, and logistics are agreed with the partner.",
        "The SAT account manager supports detailed planning during regular client experience meetings.",
        "Event date and venue are confirmed and booking forms completed.",
        "Catering is ordered and event promotion is coordinated through appropriate student channels.",
      ],
      outcome:
        "The sponsored student engagement event is delivered on campus, creating a structured opportunity for direct interaction between students and the partner.",
    },
    terms: [
      "Sponsorship covers catering for up to 50 attendees; additional catering or services are charged to the partner.",
      "Event content and format must be jointly agreed and appropriate for UCL audiences.",
      "Event dates are subject to room availability and wider campus scheduling constraints.",
      "Health and safety, safeguarding, and UCL policies apply to all activities.",
    ],
  },

  //
  // B07 – Dedicated client experience manager
  //
  {
    id: "B07",
    tierMin: "silver",
    category: "Operations",
    label: "Dedicated Strategic Alliances Client Experience Manager",
    description:
      "Benefit from a single point of contact who understands your priorities and helps you navigate opportunities across research, talent, and innovation. This support ensures your membership delivers tangible engagement and strategic value.",
    process: {
      trigger: "Membership is initiated or renewed at an eligible tier.",
      actions: [
        "A lead SAT contact is assigned based on sector alignment and partnership needs.",
        "An introductory onboarding call is arranged to understand the partner’s goals and priorities.",
        "Regular client experience check-ins are scheduled (typically quarterly, or as needed).",
        "The account manager supports partners in agreeing attendance details for short courses.",
        "The account manager helps plan the executive education taster session where applicable.",
        "The account manager coordinates engagement events such as student engagement sponsorship and hackathons.",
      ],
      outcome:
        "The partner receives consistent account management support and a coherent view of opportunities across research, talent, and innovation.",
    },
    terms: [
      "SAT provides guidance and coordination but cannot guarantee all requested engagements or timelines.",
      "Response times follow departmental service standards and may vary at peak periods.",
      "The partner is expected to nominate a primary contact to work with the account manager.",
    ],
  },

  //
  // B08 – Pop-up careers stand (half day)
  //
  {
    id: "B08",
    tierMin: "silver",
    category: "Workforce Development & Talent Acquisition",
    label: "Pop-Up Careers Fair Stand (Half Day)",
    description:
      "Meet students on campus through a branded stand during high-traffic periods. This provides meaningful face-to-face outreach that enhances visibility and boosts recruitment conversations.",
    process: {
      trigger: "Termly planning of careers fair and pop-up stand spaces begins.",
      actions: [
        "SAT coordinates with the UCL Careers Service to identify suitable dates and locations for pop-up stands.",
        "A half-day stand slot is allocated to the partner, subject to availability.",
        "The partner receives guidance on stand format, arrival times, and logistics.",
        "The Facilities team arranges a table, chairs, and basic signage where appropriate.",
      ],
      outcome:
        "The partner hosts a half-day pop-up stand on campus and engages in face-to-face conversations with students.",
    },
    terms: [
      "Dates and locations depend on UCL Careers Service and campus availability.",
      "Partners must provide their own promotional materials and staffing.",
      "Transport, set-up, and pack-down are the partner’s responsibility.",
    ],
  },

  //
  // B09 – Curated UCL short courses
  //
  {
    id: "B09",
    tierMin: "gold",
    category: "Workforce Development & Talent Acquisition",
    label: "Access to Curated UCL Short Courses",
    description:
      "Receive a curated list of UCL professional learning opportunities aligned with your capabilities, leadership development, and digital transformation goals. These courses support workforce upskilling and strengthen your organisation’s technical readiness.",
    process: {
      trigger: "Membership at an eligible tier is activated.",
      actions: [
        "SAT assembles and maintains a curated list of relevant UCL short courses and CPD opportunities.",
        "The curated list is shared with the partner’s lead contact, with updates typically provided annually.",
        "During client experience meetings, the account manager supports partners in identifying suitable courses for staff.",
        "The account manager helps arrange attendance details and coordinates with course providers where needed.",
      ],
      outcome:
        "The partner has ongoing access to curated learning opportunities that support staff development and organisational capability-building.",
    },
    terms: [
      "The membership fee covers course fees up to £250 per person, for up to five individuals per membership year.",
      "Partners may choose more expensive courses or send additional participants, with incremental fees charged separately and invoiced by the Strategic Alliances team.",
      "Course availability, dates, and modes of delivery are determined by the delivering UCL department and may change.",
    ],
  },

  //
  // B10 – VIP invitations to departmental events
  //
  {
    id: "B10",
    tierMin: "gold",
    category: "PR & Networking",
    label: "VIP Invitations to Departmental Special Events",
    description:
      "Gain access to exclusive events with academic leaders, researchers, and industry innovators. These opportunities deepen relationships, enhance strategic insight, and open doors to collaborative initiatives.",
    process: {
      trigger: "SAT is notified of VIP-level departmental or faculty events suitable for partners.",
      actions: [
        "SAT identifies member organisations for whom the event is most relevant.",
        "Invitations are allocated to eligible partners in line with capacity and event objectives.",
        "The Communications team distributes formal invitations with programme details.",
        "Attendance preferences and RSVPs are captured and shared with organisers.",
      ],
      outcome:
        "Partner representatives attend high-profile departmental events and engage with academic and industry leaders.",
    },
    terms: [
      "Places may be limited based on venue capacity and event design.",
      "UCL reserves the right to prioritise or reallocate invitations based on relevance and strategic fit.",
      "Invitees are expected to confirm attendance within the requested timeframe.",
    ],
  },

  //
  // B11 – Recruiter-in-residence
  //
  {
    id: "B11",
    tierMin: "gold",
    category: "Workforce Development & Talent Acquisition",
    label: "Recruiter-in-Residence: On-Campus Interview Space",
    description:
      "Conduct interviews on campus using our meeting rooms, allowing you to streamline assessment processes and reduce barriers for student candidates. This enhances your recruitment experience while showcasing your organisational commitment to accessibility and inclusion.",
    process: {
      trigger: "The partner requests the use of UCL spaces for on-campus interviews.",
      actions: [
        "SAT discusses interview needs and preferred dates with the partner.",
        "SAT coordinates with the UCL Careers Service to identify suitable rooms and times.",
        "Room availability is checked and a booking is made where possible.",
        "The partner receives confirmation of the booking and practical instructions for arrival and use.",
      ],
      outcome:
        "Interviews are held on campus in UCL facilities, providing a convenient and inclusive experience for student candidates.",
    },
    terms: [
      "Room availability varies, especially during teaching weeks and exam periods.",
      "All arrangements are subject to UCL Careers Service policies and room booking rules.",
      "Facility use is limited to interviewing and related activities; storage and overnight setups are not permitted.",
      "Partners are responsible for respecting building rules and returning rooms to an appropriate condition.",
    ],
  },

  //
  // B12 – Hackathon / consultancy challenge
  //
  {
    id: "B12",
    tierMin: "gold",
    category: "Innovation",
    label:
      "Sponsorship and Participation in One Hackathon or Consultancy Challenge",
    description:
      "Engage with multidisciplinary student teams tackling real-world challenges relevant to your organisation. This format accelerates idea generation, strengthens employer brand, and helps identify creative problem-solvers.",
    process: {
      trigger:
        "The partner expresses interest in a challenge-based activity, or a suitable opportunity is identified by SAT.",
      actions: [
        "SAT works with the partner to define a suitable challenge theme and scope.",
        "Dates, format, and expected outcomes are agreed.",
        "A sponsorship package is defined, including budget, prizes, and judging involvement.",
        "The account manager supports planning during client experience meetings and coordinates with academic leads.",
        "Event logistics and student recruitment are organised, and the partner is briefed on their role (e.g., mentor, judge, or speaker).",
      ],
      outcome:
        "A hackathon or consultancy challenge is delivered with active partner involvement, generating ideas and strengthening engagement.",
    },
    terms: [
      "Sponsorship covers event-related costs as defined in advance of the activity.",
      "UCL retains editorial control over academic content and student learning outcomes.",
      "Intellectual property outcomes are subject to separate agreement and are not automatically transferred.",
      "Event scope and timelines must be realistic and compatible with student and academic availability.",
    ],
  },

  //
  // B13 – Steering group seat
  //
  {
    id: "B13",
    tierMin: "platinum",
    category: "Operations",
    label: "Seat on the Friends of UCL Computer Science Steering Group",
    description:
      "Join a strategic advisory forum shaping the direction of university-industry collaboration. This provides influence, early insight into departmental initiatives, and an opportunity to co-design talent and innovation programmes.",
    process: {
      trigger: "Membership at an eligible tier is confirmed.",
      actions: [
        "The partner is invited to nominate a senior representative for the steering group.",
        "Steering group membership is recorded and added to distribution lists.",
        "An annual or multi-year meeting schedule is shared with the representative.",
        "Papers and materials are circulated in advance of each meeting.",
      ],
      outcome:
        "The partner participates in steering group discussions and contributes to the strategic direction of industry engagement in UCL Computer Science.",
    },
    terms: [
      "The steering group seat is held by one named representative per organisation.",
      "The steering group has an advisory role and does not carry formal decision-making authority.",
      "Meeting frequency is typically two to three times per year, but may vary over time.",
      "Members are expected to engage constructively and respect confidentiality where requested.",
    ],
  },

  //
  // B14 – ExecEd taster day
  //
  {
    id: "B14",
    tierMin: "platinum",
    category: "Workforce Development & Talent Acquisition",
    label: "Executive Education Taster Session for up to 20 Leaders (1 Day)",
    description:
      "Experience a bespoke, university-led development session tailored to emerging trends in computing and innovation. This offers executives new perspectives, practical frameworks, and exposure to cutting-edge research.",
    process: {
      trigger: "The partner requests to schedule an executive education taster session.",
      actions: [
        "SAT gathers initial requirements on topics, audience, and objectives from the partner.",
        "SAT coordinates with the UCL Executive Education team to shape a suitable one-day agenda.",
        "The account manager supports detailed planning during client experience meetings.",
        "Date, venue, and facilitators are agreed with the partner.",
        "Materials are prepared and final logistics are confirmed before the session.",
      ],
      outcome:
        "Up to 20 of the partner’s leaders attend a one-day executive education taster programme focused on relevant computing and innovation themes.",
    },
    terms: [
      "The benefit is limited to one taster session per membership year.",
      "Content customisation is light-touch; full bespoke programme design requires additional fees.",
      "The maximum number of participants included in this benefit is 20.",
      "Rescheduling may be constrained by facilitator availability and venue bookings.",
    ],
  },

  //
  // B15 – Reverse mentoring support
  //
  {
    id: "B15",
    tierMin: "platinum",
    category: "Workforce Development & Talent Acquisition",
    label: "Dedicated Support for Reverse Mentoring Programmes",
    description:
      "Work with our team to establish or enhance reverse mentoring between your staff and UCL students. This facilitates cross-generational learning, improves leadership practice, and brings authentic insight into emerging workforce expectations.",
    process: {
      trigger: "The partner expresses interest in establishing or developing a reverse mentoring programme.",
      actions: [
        "SAT meets with the partner to define the aims, scale, and scope of the programme.",
        "Suitable student mentors are identified in collaboration with academic and professional services teams.",
        "A schedule of mentoring sessions is designed and agreed.",
        "Sessions are supported, monitored, and evaluated in partnership with the partner.",
      ],
      outcome:
        "A reverse mentoring cycle is delivered, providing structured opportunities for staff to learn from student perspectives.",
    },
    terms: [
      "Student participation depends on availability, interest, and appropriate matching.",
      "The partner must commit appropriate staff time and internal coordination to make the programme effective.",
      "Programme objectives must align with the educational remit and values of the university.",
      "Safeguarding, confidentiality, and ethical guidelines must be followed throughout.",
    ],
  },

  //
  // B16 – PhD networking invitations
  //
  {
    id: "B16",
    tierMin: "platinum",
    category: "PR & Networking",
    label: "Invitation to Network with PhD Researchers",
    description:
      "Connect directly with our doctoral community to explore advanced research, emerging technologies, and collaboration opportunities. This supports early insight into specialist talent and deepens engagement within our research ecosystem.",
    process: {
      trigger: "A PhD-focused networking event or activity is planned that is suitable for external partners.",
      actions: [
        "SAT identifies partner representatives who are likely to benefit from attending.",
        "Invitations are issued with event details, objectives, and any preparation required.",
        "Attendance is coordinated with event organisers, including any matching or breakout arrangements.",
      ],
      outcome:
        "Partner representatives interact with PhD researchers, explore areas of mutual interest, and identify potential collaboration opportunities.",
    },
    terms: [
      "Events may have limited capacity and places may be prioritised based on strategic fit.",
      "Participation in networking activities does not guarantee research collaboration or funding agreements.",
      "Partners are expected to respect academic independence and research integrity.",
    ],
  },

  //
  // B17 – Pop-up stand (full day), superseding B08
  //
  {
    id: "B17",
    tierMin: "platinum",
    category: "Workforce Development & Talent Acquisition",
    label: "Pop-Up Careers Fair Stand (Full Day)",
    description:
      "Spend a full day meeting students in high-visibility, high-engagement spaces on campus. This significantly strengthens your recruitment presence and allows for deeper conversations throughout the day.",
    supersedes: ["B08"],
    process: {
      trigger: "Termly planning of careers fair and pop-up stand spaces begins.",
      actions: [
        "SAT coordinates with the UCL Careers Service to identify full-day stand options suitable for partners.",
        "A full-day pop-up stand slot is allocated to the partner, subject to availability.",
        "The partner receives detailed guidance on stand format, staffing, and arrival times.",
        "The Facilities team arranges a table, chairs, and basic signage where appropriate.",
      ],
      outcome:
        "The partner hosts a full-day pop-up stand on campus, enabling extended engagement with students throughout the day.",
    },
    terms: [
      "Dates and locations depend on UCL Careers Service and campus availability.",
      "Partners must provide their own promotional materials and staffing.",
      "Transport, set-up, and pack-down are the partner’s responsibility.",
      "Health and safety and building access rules apply and must be followed at all times.",
    ],
  },
];
