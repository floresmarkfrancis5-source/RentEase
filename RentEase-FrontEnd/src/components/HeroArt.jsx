/** Crisp vector mockup of a classic property-management desktop application. */
export default function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 1200 720" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <g className="desk-art">
        <rect className="desk-shadow" x="610" y="124" width="520" height="474" />
        <rect className="desk-window" x="584" y="100" width="520" height="474" />
        <rect className="desk-titlebar" x="584" y="100" width="520" height="36" />
        <rect className="desk-mark" x="596" y="111" width="14" height="14" />
        <text className="desk-title" x="619" y="124">RENTEASE PROPERTY DESK</text>
        <rect className="desk-window-button" x="1068" y="110" width="24" height="16" />
        <path className="desk-rule" d="M584 136h520" />

        <rect className="desk-menu" x="584" y="137" width="520" height="28" />
        <text className="desk-menu-text" x="600" y="155">File</text>
        <text className="desk-menu-text" x="640" y="155">Records</text>
        <text className="desk-menu-text" x="704" y="155">Reports</text>
        <text className="desk-menu-text" x="769" y="155">Help</text>

        <rect className="desk-sidebar" x="585" y="166" width="128" height="373" />
        <text className="desk-label" x="601" y="191">WORKSPACE</text>
        <rect className="desk-nav-active" x="595" y="203" width="108" height="29" />
        <text className="desk-nav-active-text" x="607" y="222">Overview</text>
        <text className="desk-nav-text" x="607" y="255">Properties</text>
        <text className="desk-nav-text" x="607" y="286">Tenants</text>
        <text className="desk-nav-text" x="607" y="317">Rent ledger</text>
        <text className="desk-nav-text" x="607" y="348">Maintenance</text>
        <path className="desk-rule" d="M585 375h128" />
        <text className="desk-label" x="601" y="398">QUICK VIEW</text>
        <text className="desk-nav-text" x="601" y="426">4 properties</text>
        <text className="desk-nav-text" x="601" y="450">18 active units</text>
        <text className="desk-nav-text" x="601" y="474">3 payments due</text>

        <text className="desk-heading" x="736" y="197">Good morning,</text>
        <text className="desk-subheading" x="736" y="218">Here is your rental summary.</text>

        <rect className="desk-stat" x="736" y="237" width="106" height="66" />
        <rect className="desk-stat" x="850" y="237" width="106" height="66" />
        <rect className="desk-stat" x="964" y="237" width="122" height="66" />
        <text className="desk-label" x="747" y="255">OCCUPIED</text>
        <text className="desk-number" x="747" y="288">18 / 20</text>
        <text className="desk-label" x="861" y="255">COLLECTED</text>
        <text className="desk-number" x="861" y="288">₱82,500</text>
        <text className="desk-label" x="975" y="255">NEEDS ATTENTION</text>
        <text className="desk-number" x="975" y="288">03 items</text>

        <text className="desk-section-title" x="736" y="330">RECENT RENT ACTIVITY</text>
        <rect className="desk-table-head" x="736" y="342" width="350" height="26" />
        <text className="desk-label" x="746" y="359">TENANT</text>
        <text className="desk-label" x="866" y="359">UNIT</text>
        <text className="desk-label" x="930" y="359">AMOUNT</text>
        <text className="desk-label" x="1020" y="359">STATUS</text>

        <path className="desk-rule" d="M736 397h350M736 426h350M736 455h350M736 484h350" />
        <text className="desk-table-text" x="746" y="387">Maria Santos</text>
        <text className="desk-table-text" x="866" y="387">Unit 2B</text>
        <text className="desk-table-text" x="930" y="387">₱4,500</text>
        <rect className="desk-status-ok" x="1018" y="375" width="50" height="18" />
        <text className="desk-status-text" x="1025" y="388">PAID</text>
        <text className="desk-table-text" x="746" y="416">Jose Rivera</text>
        <text className="desk-table-text" x="866" y="416">Unit 1A</text>
        <text className="desk-table-text" x="930" y="416">₱6,500</text>
        <rect className="desk-status-due" x="1018" y="404" width="50" height="18" />
        <text className="desk-status-text" x="1023" y="417">DUE</text>
        <text className="desk-table-text" x="746" y="445">Ana dela Cruz</text>
        <text className="desk-table-text" x="866" y="445">Unit 3C</text>
        <text className="desk-table-text" x="930" y="445">₱5,200</text>
        <rect className="desk-status-ok" x="1018" y="433" width="50" height="18" />
        <text className="desk-status-text" x="1025" y="446">PAID</text>

        <rect className="desk-toolbar" x="585" y="539" width="519" height="35" />
        <text className="desk-statusbar-text" x="600" y="561">READY</text>
        <text className="desk-statusbar-text" x="998" y="561">RENT ROLL · 2026</text>
      </g>
    </svg>
  )
}
