import {describe,expect,it} from 'vitest';
import {setOwnerAdminUiState,type OwnerAdminUiElements} from './ui-state';

function setup(){
  document.body.innerHTML='<section id="gate"><div id="checking"></div><form id="login"></form><section id="denied"><p id="message" aria-live="assertive"></p></section></section><main id="app"></main>';
  return {
    gate:document.querySelector('#gate')!,
    checking:document.querySelector('#checking')!,
    login:document.querySelector('#login')!,
    denied:document.querySelector('#denied')!,
    deniedMessage:document.querySelector('#message')!,
    app:document.querySelector('#app')!
  } satisfies OwnerAdminUiElements;
}

describe('owner admin authentication UI states',()=>{
  it('shows only the authentication check while checking',()=>{
    const elements=setup();setOwnerAdminUiState(elements,'checking');
    expect(elements.gate).not.toHaveAttribute('hidden');expect(elements.checking).not.toHaveAttribute('hidden');expect(elements.login).toHaveAttribute('hidden');expect(elements.denied).toHaveAttribute('hidden');expect(elements.app).toHaveAttribute('hidden');expect(elements.gate).toHaveAttribute('aria-busy','true');
  });
  it('shows only the login form while signed out',()=>{
    const elements=setup();setOwnerAdminUiState(elements,'signed-out');
    expect(elements.gate).not.toHaveAttribute('hidden');expect(elements.checking).toHaveAttribute('hidden');expect(elements.login).not.toHaveAttribute('hidden');expect(elements.denied).toHaveAttribute('hidden');expect(elements.app).toHaveAttribute('hidden');
  });
  it('shows a visible live-region denial while signed in but unauthorized',()=>{
    const elements=setup();setOwnerAdminUiState(elements,'unauthorized','Admin document was not found.');
    expect(elements.gate).not.toHaveAttribute('hidden');expect(elements.checking).toHaveAttribute('hidden');expect(elements.login).toHaveAttribute('hidden');expect(elements.denied).not.toHaveAttribute('hidden');expect(elements.deniedMessage).toHaveTextContent('Admin document was not found.');expect(elements.deniedMessage).toHaveAttribute('aria-live','assertive');expect(elements.app).toHaveAttribute('hidden');
  });
  it('hides the entire gate and shows only the dashboard when authorized',()=>{
    const elements=setup();setOwnerAdminUiState(elements,'authorized');
    expect(elements.gate).toHaveAttribute('hidden');expect(elements.login).toHaveAttribute('hidden');expect(elements.denied).toHaveAttribute('hidden');expect(elements.app).not.toHaveAttribute('hidden');
  });
});
