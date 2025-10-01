back:
	rm -rf node_modules && npm install && npm start
front:
	cd frontend && rm -rf node_modules && npm install --legacy-peer-deps && npm start
front2:
	cd frontend && npm start