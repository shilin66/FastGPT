export const omniTheme = {
  colors: {
    graphite: '#27364A',
    graphiteHover: '#1F2A3A',
    saturatedBlue: '#2563EB',
    saturatedBlueHover: '#1D4ED8',
    saturatedBlueSoft: '#DBEAFE',
    gold: '#C69B4A',
    goldSoft: '#F3E7C6',
    pageBg: '#F8FAFC',
    sidebarBg: '#F5F7FA',
    activeBg: '#EDF2F7',
    surface: '#FFFFFF',
    border: '#DFE5EE',
    text: '#1F2937',
    muted: '#667085'
  },
  radii: {
    sm: '6px',
    md: '8px',
    lg: '12px'
  },
  typography: {
    agentTitle: '13px',
    agentBody: '12px',
    agentCaption: '11px',
    agentMicro: '10px',
    tightLineHeight: 1.3,
    bodyLineHeight: 1.45
  },
  layout: {
    agentChannelHeaderHeight: '46px',
    agentNavHeaderHeight: '48px',
    agentNavExpandedWidth: '184px',
    agentNavCollapsedWidth: '56px',
    agentNavItemMinHeight: '38px',
    agentSectionMinHeight: '58px',
    agentChapterWidth: '30px',
    agentRowColumns: 'minmax(140px, 168px) minmax(0, 1fr) auto',
    agentActionMinHeight: '32px',
    agentSplitGutterWidth: '8px',
    agentSplitDesktopMinWidth: '960px',
    agentSplitHandleHeight: '34px'
  },
  motion: {
    control: 'background-color 160ms ease, color 160ms ease',
    resize: 'background-color 180ms ease, width 180ms ease',
    resizeColor: 'background-color 180ms ease'
  },
  shadows: {
    card: '0 18px 44px -34px rgba(31, 41, 55, 0.28)',
    active: '0 8px 24px -18px rgba(39, 54, 74, 0.35)'
  },
  login: {
    layout: {
      brandBasis: '56%',
      brandContentWidth: '544px',
      formWidth: '330px',
      desktopScaleLg: 1.12,
      desktopScaleXl: 1.2,
      mobileSidePadding: '24px'
    },
    brandGradient: 'linear-gradient(150deg, #1F2A3A, #27364A 55%, #31445E)',
    brandBlueGlow: 'radial-gradient(circle, rgba(37, 99, 235, 0.36), rgba(37, 99, 235, 0) 68%)',
    brandGoldGlow: 'radial-gradient(circle, rgba(198, 155, 74, 0.15), rgba(198, 155, 74, 0) 68%)',
    surfaceGradient: 'linear-gradient(180deg, #FFFFFF, #F8FAFC 62%, #DBEAFE 135%)',
    graphiteLight: '#31445E',
    label: '#475467',
    placeholder: '#98A2B3',
    blueLight: '#8EB1FF',
    goldText: '#E8CE9C',
    onPanel: 'rgba(255, 255, 255, 0.88)',
    onPanelMuted: 'rgba(255, 255, 255, 0.66)',
    onPanelQuiet: 'rgba(255, 255, 255, 0.4)',
    glassFill: 'linear-gradient(160deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.05))',
    glassSurface: 'linear-gradient(180deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.05))',
    glassNode: 'rgba(255, 255, 255, 0.065)',
    glassBorder: 'rgba(255, 255, 255, 0.14)',
    glassHighlight: 'rgba(255, 255, 255, 0.06)',
    agentBorder: 'rgba(142, 177, 255, 0.38)',
    agentGlow: 'rgba(37, 99, 235, 0.28)',
    agentLine: 'rgba(142, 177, 255, 0.88)',
    agentLineMuted: 'rgba(142, 177, 255, 0.09)',
    agentLineQuiet: 'rgba(142, 177, 255, 0.08)',
    goldBorder: 'rgba(198, 155, 74, 0.45)',
    goldGlow: 'rgba(198, 155, 74, 0.12)',
    goldLine: 'rgba(232, 206, 156, 0.92)',
    nodeBlue: '#0091FF',
    nodeViolet: '#7479FF',
    nodeGreen: '#43CA40',
    nodeOrange: '#EBA33C',
    nodeShadow: 'rgba(0, 0, 0, 0.8)',
    legendBlueFill: 'rgba(142, 177, 255, 0.09)',
    focusRing: '0 0 0 3px rgba(37, 99, 235, 0.1)'
  }
} as const;
