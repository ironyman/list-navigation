# Prequisites
Need nodejs and vsce to build, on Windows we can use choco.
```
cinst -y nodejs
npm i -g vsce
```

# Build
```
npm i
npm run compile
```
Run in a test VS Code instance.
```
code --extensionDevelopmentPath="$(pwd)"
```

# Produce vsix
```
vsce package
```

Install
```
code --install-extension list-navigation*.vsix
```