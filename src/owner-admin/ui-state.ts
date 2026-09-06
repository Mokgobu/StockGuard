export type OwnerAdminUiState='checking'|'signed-out'|'unauthorized'|'authorized';

export type OwnerAdminUiElements={
  gate:HTMLElement;
  checking:HTMLElement;
  login:HTMLElement;
  denied:HTMLElement;
  deniedMessage:HTMLElement;
  app:HTMLElement;
};

export function setOwnerAdminUiState(elements:OwnerAdminUiElements,state:OwnerAdminUiState,message=''){
  const authorized=state==='authorized';
  elements.gate.hidden=authorized;
  elements.app.hidden=!authorized;
  elements.checking.hidden=state!=='checking';
  elements.login.hidden=state!=='signed-out';
  elements.denied.hidden=state!=='unauthorized';
  elements.gate.setAttribute('aria-busy',String(state==='checking'));
  elements.deniedMessage.textContent=state==='unauthorized'?message:'';
}
