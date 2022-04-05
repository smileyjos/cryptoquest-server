const controller = require('../controllers/nft.controller');

module.exports = function (app) {
  app.use(function (req, res, next) {
    res.header(
      'Access-Control-Allow-Headers',
      'x-access-token, Origin, Content-Type, Accept'
    );
    next();
  });

  // Reveal nft
  app.post('/api/reveal', controller.revealNft);

  // Customize nft
  app.post('/api/customize', controller.customizeNft);

  // Load list of customized nfts for Admin UI
  app.get('/api/nfts', controller.loadCustomizedNfts);

  // Load single customized nft for Admin UI
  app.get('/api/nfts/:nftId', controller.loadCustomizedNft);

  // Edit customized nft from Admin UI
  app.put('/api/nfts/:nftId', controller.editCustomizedNft);

  // Delete customized nft
  app.delete('/api/nfts/:nftId', controller.deleteCustomizedNft);
};