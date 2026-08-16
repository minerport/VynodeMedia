const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('vynodeDesktop',{chooseMediaFolder:()=>ipcRenderer.invoke('choose-media-folder')});
