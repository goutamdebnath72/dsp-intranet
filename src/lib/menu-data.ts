// src/lib/menu-data.ts

// --- 1. Define the Types ---

export type MenuLink = {
    label: string;
    href: string;
};

export type MenuColumn = {
    heading: string;
    links: MenuLink[];
};

export type MenuItemData = {
    title: string;
    columns: MenuColumn[];
};

// --- 2. Define the Menu Data ---

export const menuData: MenuItemData[] = [
    {
        title: "People",
        columns: [
            {
                heading: "General",
                links: [
                    { label: "Employee Enquiry", href: "#" },
                    { label: "Universal Search", href: "#" },
                    { label: "Employee Self Service", href: "#" },
                    { label: "Trainee Enquiry", href: "#" },
                    { label: "Formats", href: "#" },
                    { label: "HR Reports", href: "#" },
                ],
            },
            {
                heading: "Rules & Manuals",
                links: [
                    { label: "SAII-CDA Rules", href: "#" },
                    { label: "SAIL-TA Rules", href: "#" },
                    { label: "Standing Orders", href: "#" },
                    { label: "Personnel Manual", href: "#" },
                ],
            },
            {
                heading: "Circulars",
                links: [
                    { label: "CHRD", href: "#" },
                    { label: "Cost Control", href: "#" },
                    { label: "ECD", href: "#" },
                    { label: "Finance", href: "#" },
                    { label: "Finance Taxation Circular", href: "#" },
                    { label: "MMIS", href: "#" },
                    { label: "Mobile Scheme", href: "#" },
                    { label: "Safety", href: "#" },
                    { label: "Town Services", href: "#" },
                ],
            },
            {
                heading: "Circulars (Personnel)",
                links: [
                    { label: "Personnel - Circular", href: "#" },
                    { label: "Personnel - Central JO Manual", href: "#" },
                ],
            },
            {
                heading: "Vigilance",
                links: [
                    { label: "Vigilance (Main)", href: "#" },
                    { label: "Vigilance - CVC", href: "#" },
                    { label: "Vigilance - CTE", href: "#" },
                    { label: "Vigilance - Misc. Govt", href: "#" },
                    { label: "Vigilance - Purchase Contract", href: "#" },
                ],
            },
            {
                heading: "Calculators & Uploads",
                links: [
                    { label: "House Building Loan Calculation", href: "#" },
                    { label: "EMI Calculation", href: "#" },
                    { label: "DSP PF Loan", href: "#" },
                    { label: "Recurring Deposit Calculation", href: "#" },
                    { label: "Fixed Deposit Calculation", href: "#" },
                    { label: "Upload Scroll", href: "#" },
                    { label: "Vigilance Upload", href: "#" },
                ],
            },
        ],
    },
    {
        title: "Policies",
        columns: [
            {
                heading: "Statements",
                links: [
                    { label: "Mission Statement", href: "#" },
                    { label: "Policy", href: "#" },
                ],
            },
        ],
    },
    {
        title: "Publications",
        columns: [
            {
                heading: "General",
                links: [
                    { label: "IPR", href: "#" },
                    { label: "Press Release", href: "#" },
                    { label: "DSP News", href: "#" },
                    { label: "Ispat Sambad", href: "#" },
                    { label: "Corporate Design Manual", href: "#" },
                    { label: "Texpression", href: "#" },
                    { label: "Strides", href: "#" },
                    { label: "Safety Digests", href: "#" },
                    { label: "Disaster Management Plan", href: "#" },
                    { label: "Strategic Manager", href: "#" },
                ],
            },
            {
                heading: "Reports & Procedures",
                links: [
                    { label: "Sustainability Report 2015-16", href: "#" },
                    { label: "Purchase Contract Procedure", href: "#" },
                    { label: "New Penal provision for contract", href: "#" },
                    { label: "Township Layout (pdf)", href: "#" },
                    { label: "Township Layout (dwg)", href: "#" },
                ],
            },
            {
                heading: "Media & Parks",
                links: [
                    { label: "SRM Go-Live Video", href: "#" },
                    { label: "Video:CISF-Towards National Security", href: "#" },
                    { label: "Video: Steel Talk - Vivechna", href: "#" },
                    { label: "VASUNDHARA - SAIL Bio-diversity", href: "#" },
                ],
            },
            {
                heading: "Performance",
                links: [
                    { label: "Annual Performance: 2014-15", href: "#" },
                    { label: "Annual Performance: 2013-14", href: "#" },
                    { label: "Annual Performance: 2012-13", href: "#" },
                    { label: "Annual Performance: 2011-12", href: "#" },
                ],
            },
            {
                heading: "Documents",
                links: [
                    { label: "Cost Control: Highlights 2013-14", href: "#" },
                    { label: "Cost Control: Cost Reduction", href: "#" },
                    { label: "Cost Control: Coordination Meetings", href: "#" },
                    { label: "Conferences: METEC InSteelCon 2011", href: "#" },
                    { label: "QMS Standard", href: "#" },
                    { label: "DSP Manual for IMS", href: "#" },
                    { label: "QMS: PROCEDURES", href: "#" },
                    { label: "QMS: Objectives & Targets", href: "#" },
                    { label: "QMS: Audit", href: "#" },
                    { label: "QMS: Awareness", href: "#" },
                    { label: "QMS: Reviews", href: "#" },
                    { label: "QMS: Coordinator meet Minutes", href: "#" },
                    { label: "QMS: Documents", href: "#" },
                ],
            },
            {
                heading: "O&M",
                links: [
                    { label: "Guidelines for Assessment of Trial", href: "#" },
                    { label: "System & Procedures", href: "#" },
                    { label: "File Preparation Guidelines", href: "#" },
                    { label: "Delegation of Power", href: "#" },
                ],
            },
        ],
    },
    {
        title: "Downloads",
        columns: [
            {
                heading: "Forms & Guides",
                links: [
                    { label: "Safety-IOW Procedure forms", href: "#" },
                    { label: "Intranet Site Hosting Request Form", href: "#" },
                    { label: "Vigilance Forms", href: "#" },
                    { label: "Unicode Font", href: "#" },
                    { label: "My IP", href: "#" },
                    { label: 'Mobile APP - "DSP Directory"', href: "#" },
                    { label: 'Installation guide - "DSP Directory"', href: "#" },
                ],
            },
            {
                heading: "DMS",
                links: [
                    { label: "DMS Template", href: "#" },
                    { label: "Instructions for filling DMS Template", href: "#" },
                ],
            },
            {
                heading: "Software (Utilities)",
                links: [
                    { label: "GSTIN Validation", href: "#" },
                    { label: "Reduce PDF Size", href: "#" },
                    { label: "Visitor Pass Software", href: "#" },
                    { label: "MSE Antivirus", href: "#" },
                    { label: "Windows Update", href: "#" },
                    { label: "Windows Archiver(WinRAR)", href: "#" },
                    { label: "Adobe Flash Player", href: "#" },
                    { label: "Acrobat Reader DC", href: "#" },
                    { label: "Ilink95", href: "#" },
                    { label: "MS Office PDF Converter", href: "#" },
                    { label: "PPC Application", href: "#" },
                    { label: "JRE 8", href: "#" },
                    { label: "Weigh Bridge Software", href: "#" },
                ],
            },
            {
                heading: "Software (Network & Tools)",
                links: [
                    { label: "Link View", href: "#" },
                    { label: "IPCONFIG/flushdns (Right Click)", href: "#" },
                    { label: "PING (Right Click)", href: "#" },
                    { label: "Automatic Route Add (Right Click)", href: "#" },
                    { label: "FileZilla", href: "#" },
                    { label: "Notepad++", href: "#" },
                    { label: "Tamla & Gate-5 Camera software", href: "#" },
                ],
            },
            {
                heading: "Software (Nested)",
                links: [
                    { label: "Microsoft .NET - DotNet 4", href: "#" },
                    { label: "Microsoft .NET - DotNet 3.5", href: "#" },
                    { label: "Putty - Software", href: "#" },
                    { label: "Putty - Settings", href: "#" },
                    { label: "ITMS Setup (32-bit)", href: "#" },
                    { label: "ITMS Setup (64-bit)", href: "#" },
                ],
            },
            {
                heading: "Browsers",
                links: [
                    { label: "IE-11 For Windows 7.1", href: "#" },
                    { label: "IE-10 For Windows 7", href: "#" },
                    { label: "IE-8 For Windows Vista", href: "#" },
                    { label: "IE-8 For Windows XP", href: "#" },
                    { label: "Mozilla Firefox", href: "#" },
                    { label: "Google Chrome (32-bit)", href: "#" },
                    { label: "Google Chrome (64-bit)", href: "#" },
                ],
            },
        ],
    },
    {
        // --- NEW: Letters Menu ---
        title: "Letters from Hon'ble PM",
        columns: [
            {
                heading: "Audience",
                links: [
                    { label: "Senior Citizens (Hindi)", href: "#" },
                    { label: "Senior Citizens (English)", href: "#" },
                    { label: "Workers", href: "#" }, // Assuming this has sub-links, but none were shown
                    { label: "Youth (Hindi)", href: "#" },
                    { label: "Youth (English)", href: "#" },
                ],
            },
        ],
    },
    {
        // --- NEW: Licensing Menu ---
        title: "Licensing",
        columns: [
            {
                heading: "Circulars",
                links: [
                    { label: "Fresh licensing for Ex-licencees", href: "#" },
                    { label: "Circular dated 31/08/2015", href: "#" },
                    { label: "Circular dated 20/08/2015", href: "#" },
                ],
            },
        ],
    },
    {
        // --- NEW: About Us Menu ---
        title: "About Us",
        columns: [
            {
                heading: "Information",
                links: [
                    { label: "Vision & Credo", href: "#" },
                    { label: "An Overview", href: "#" },
                    { label: "Organizational Structure", href: "#" },
                    { label: "Press Release", href: "#" },
                    { label: "DSP News Clips", href: "#" },
                    { label: "Corp News Clips", href: "#" },
                ],
            },
        ],
    },
];