all:
	tsc -p tsconfig.json --jsx react

clean:
	rm dist/*

dev:
	tsc -p tsconfig.json --jsx react --watch
