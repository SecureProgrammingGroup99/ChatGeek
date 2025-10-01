# Useful commands
1. `lsof -i -P -n | grep LISTEN` -> To check for all the ports that are being used

# Changes that Michelle has made in this branch due to her local environment

* My PORT 5000 is being used and there is no way I can turn that process off, so I've changed

## 1- Backend: 2 ports identified in `env` file
1. PORT in `.env` file to be 5001 instead of 5000
2. So backend will run on: (2 ports) 
- PORT 5001: API
- MESH_WS_PORT = 7081 

## 2-Front end
- React is always on port 3000
- "proxy" field in `frontend/package.json` -> Set to the same as PORT of backend, 5001