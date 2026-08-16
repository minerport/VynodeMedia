const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('vynodeDesktop',{
  chooseMediaFolder:()=>ipcRenderer.invoke('choose-media-folder'),
  toggleFullscreen:()=>ipcRenderer.invoke('toggle-fullscreen')
});
